#!/usr/bin/env node
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { OAuth2Client } from "google-auth-library";
import open from "open";
import { adapters } from "../adapters/index.js";
import { readAccounts } from "../vault/store.js";
import {
  resolveOAuth2ClientConfig,
  saveOAuth2ClientConfig,
  clearOAuth2ClientConfig,
  storeOAuth2Account,
  storeApiKeyAccount,
  deleteAccount,
} from "../vault/accounts.js";
import { checkForUpdates, applyUpdate } from "../vault/update.js";
import { assertMacKeychainSupport } from "../vault/keychain.js";
import { PAGE_HTML } from "./page.js";
import type { OAuth2AuthHooks } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/web/server.js -> project root
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const PORT = 4790;
const HOST = "127.0.0.1"; // loopback only — never bind 0.0.0.0, this handles OAuth callbacks and account management

interface PendingOAuth {
  service: string;
  label: string;
  client: OAuth2Client;
  auth: OAuth2AuthHooks;
  createdAt: number;
}
const pendingOAuth = new Map<string, PendingOAuth>();
const PENDING_TTL_MS = 10 * 60 * 1000;

function sweepPending(): void {
  const now = Date.now();
  for (const [state, entry] of pendingOAuth) {
    if (now - entry.createdAt > PENDING_TTL_MS) pendingOAuth.delete(state);
  }
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(text);
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { Location: location });
  res.end();
}

function findAdapter(service: unknown) {
  if (typeof service !== "string") return undefined;
  return adapters.find((a) => a.service === service);
}

async function handleState(res: ServerResponse): Promise<void> {
  const accounts = await readAccounts();
  const services = await Promise.all(
    adapters.map(async (a) => {
      if (a.auth.kind === "oauth2") {
        const resolved = await resolveOAuth2ClientConfig(a.auth, a.service);
        return {
          service: a.service,
          displayName: a.displayName,
          authKind: "oauth2" as const,
          configured: Boolean(resolved),
          clientSource: resolved?.source ?? null, // "user" | "shared-default" | null
          hasSharedDefault: Boolean(a.auth.defaultClient),
        };
      }
      return {
        service: a.service,
        displayName: a.displayName,
        authKind: "apikey" as const,
        configured: true,
        fields: a.auth.fields,
      };
    })
  );
  sendJson(res, 200, { services, accounts, projectRoot: PROJECT_ROOT });
}

async function handleOAuthConfig(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const service = body.service;
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";
  const adapter = findAdapter(service);

  if (!adapter || adapter.auth.kind !== "oauth2") {
    sendJson(res, 400, { ok: false, error: "Unknown or non-OAuth2 service." });
    return;
  }
  if (!clientId || !clientSecret) {
    sendJson(res, 400, { ok: false, error: "Client ID and Client Secret are both required." });
    return;
  }
  await saveOAuth2ClientConfig(adapter.service, clientId, clientSecret);
  sendJson(res, 200, { ok: true });
}

async function handleOAuthConfigReset(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const adapter = findAdapter(body.service);
  if (!adapter || adapter.auth.kind !== "oauth2") {
    sendJson(res, 400, { ok: false, error: "Unknown or non-OAuth2 service." });
    return;
  }
  await clearOAuth2ClientConfig(adapter.service);
  sendJson(res, 200, { ok: true, hasSharedDefault: Boolean(adapter.auth.defaultClient) });
}

async function handleOAuthStart(url: URL, res: ServerResponse): Promise<void> {
  const service = url.searchParams.get("service") ?? "";
  const label = (url.searchParams.get("label") ?? "").trim();
  const adapter = findAdapter(service);

  if (!adapter || adapter.auth.kind !== "oauth2") {
    redirect(res, "/?error=" + encodeURIComponent("Unknown service."));
    return;
  }
  if (!label) {
    redirect(res, "/?error=" + encodeURIComponent("A label is required."));
    return;
  }

  const clientCfg = await resolveOAuth2ClientConfig(adapter.auth, adapter.service);
  if (!clientCfg) {
    redirect(res, "/?error=" + encodeURIComponent("Set up the OAuth client for " + adapter.displayName + " first."));
    return;
  }

  sweepPending();
  const state = randomBytes(16).toString("hex");
  const redirectUri = "http://" + HOST + ":" + PORT + "/oauth/callback";
  const client = adapter.auth.createClient(clientCfg.clientId, clientCfg.clientSecret, redirectUri);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: adapter.auth.scopes,
    state,
  });

  pendingOAuth.set(state, { service: adapter.service, label, client, auth: adapter.auth, createdAt: Date.now() });
  redirect(res, authUrl);
}

async function handleOAuthCallback(url: URL, res: ServerResponse): Promise<void> {
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const pending = pendingOAuth.get(state);
  pendingOAuth.delete(state);

  if (!pending) {
    redirect(res, "/?error=" + encodeURIComponent("That sign-in link expired or was already used — try again."));
    return;
  }
  if (error || !code) {
    redirect(res, "/?error=" + encodeURIComponent("Google sign-in was not completed."));
    return;
  }

  try {
    const { tokens } = await pending.client.getToken(code);
    pending.client.setCredentials(tokens);
    const record = await storeOAuth2Account(pending.auth, pending.service, pending.label, tokens, pending.client);
    redirect(res, "/?added=" + encodeURIComponent(record.label));
  } catch (err) {
    redirect(res, "/?error=" + encodeURIComponent(err instanceof Error ? err.message : "Could not finish sign-in."));
  }
}

async function handleApiKeyAccount(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const adapter = findAdapter(body.service);
  const label = typeof body.label === "string" ? body.label.trim() : "";
  const values = (body.values && typeof body.values === "object" ? body.values : {}) as Record<string, string>;

  if (!adapter || adapter.auth.kind !== "apikey") {
    sendJson(res, 400, { ok: false, error: "Unknown or non-API-key service." });
    return;
  }
  if (!label) {
    sendJson(res, 400, { ok: false, error: "A label is required." });
    return;
  }
  try {
    const record = await storeApiKeyAccount(adapter.auth, adapter.service, label, values);
    sendJson(res, 200, { ok: true, displayName: record.displayName });
  } catch (err) {
    sendJson(res, 400, { ok: false, error: err instanceof Error ? err.message : "Could not verify credentials." });
  }
}

async function handleRemoveAccount(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  const service = typeof body.service === "string" ? body.service : "";
  const label = typeof body.label === "string" ? body.label : "";
  const removed = await deleteAccount(service, label);
  sendJson(res, 200, { ok: removed });
}

async function handleUpdateStatus(res: ServerResponse): Promise<void> {
  const status = await checkForUpdates();
  sendJson(res, 200, status);
}

async function handleUpdate(res: ServerResponse): Promise<void> {
  const lines: string[] = [];
  try {
    await applyUpdate((line) => {
      if (line) lines.push(line);
    });
    sendJson(res, 200, { ok: true, lines });
  } catch (err) {
    sendJson(res, 200, { ok: false, error: err instanceof Error ? err.message : "Update failed.", lines });
  }
}

async function main(): Promise<void> {
  assertMacKeychainSupport();

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://" + HOST + ":" + PORT);
    const handle = async (): Promise<void> => {
      if (req.method === "GET" && url.pathname === "/") return sendHtml(res, 200, PAGE_HTML);
      if (req.method === "GET" && url.pathname === "/api/state") return handleState(res);
      if (req.method === "GET" && url.pathname === "/api/update-status") return handleUpdateStatus(res);
      if (req.method === "POST" && url.pathname === "/api/update") return handleUpdate(res);
      if (req.method === "POST" && url.pathname === "/api/oauth-config") return handleOAuthConfig(req, res);
      if (req.method === "POST" && url.pathname === "/api/oauth-config/reset") return handleOAuthConfigReset(req, res);
      if (req.method === "GET" && url.pathname === "/oauth/start") return handleOAuthStart(url, res);
      if (req.method === "GET" && url.pathname === "/oauth/callback") return handleOAuthCallback(url, res);
      if (req.method === "POST" && url.pathname === "/api/apikey-account") return handleApiKeyAccount(req, res);
      if (req.method === "POST" && url.pathname === "/api/remove-account") return handleRemoveAccount(req, res);
      res.writeHead(404).end("Not found");
    };
    handle().catch((err) => {
      console.error(err);
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: "Internal error." });
    });
  });

  server.listen(PORT, HOST, () => {
    const url = "http://" + HOST + ":" + PORT;
    console.log("Account Vault control panel running at " + url);
    console.log("Press Ctrl+C to stop it.");
    void open(url).catch(() => {});
  });
}

main().catch((err) => {
  console.error("Failed to start the control panel:", err);
  process.exit(1);
});
