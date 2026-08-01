#!/usr/bin/env node
import { createServer } from "node:http";
import open from "open";
import { adapters } from "./adapters/index.js";
import { readAccounts, upsertAccount, removeAccount, readConfig, writeConfig } from "./vault/store.js";
import { keychainSet, keychainDelete, assertMacKeychainSupport } from "./vault/keychain.js";
import type { Adapter } from "./types.js";

const REDIRECT_PORT = 8765;
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/oauth2callback`;

function findAdapter(service: string): Adapter {
  const adapter = adapters.find((a) => a.service === service);
  if (!adapter) {
    const known = adapters.map((a) => a.service).join(", ");
    throw new Error(`Unknown service "${service}". Known services: ${known}`);
  }
  return adapter;
}

function waitForOAuthCallback(): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url) {
        res.writeHead(400).end();
        return;
      }
      const url = new URL(req.url, `http://127.0.0.1:${REDIRECT_PORT}`);
      if (url.pathname !== "/oauth2callback") {
        res.writeHead(404).end();
        return;
      }
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        error
          ? `<html><body><h2>Authorization failed</h2><p>${error}</p><p>You can close this tab and check the terminal.</p></body></html>`
          : `<html><body><h2>Account added</h2><p>You can close this tab and go back to the terminal.</p></body></html>`
      );
      server.close();
      if (error || !code) reject(new Error(error ?? "No authorization code returned."));
      else resolve(code);
    });
    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        reject(new Error(`Port ${REDIRECT_PORT} is already in use. Close whatever's using it and try again.`));
      } else {
        reject(err);
      }
    });
    server.listen(REDIRECT_PORT, "127.0.0.1");
  });
}

async function cmdConfig(service: string, clientId: string, clientSecret: string): Promise<void> {
  findAdapter(service); // validate it exists
  const config = await readConfig();
  config.oauthClients[service] = { clientId, clientSecret };
  await writeConfig(config);
  console.log(`Saved the OAuth client for "${service}". This is one-time per service — now run "add" for each account.`);
}

async function cmdAdd(service: string, label: string): Promise<void> {
  assertMacKeychainSupport();
  const adapter = findAdapter(service);
  const config = await readConfig();
  const clientCfg = config.oauthClients[service];
  if (!clientCfg) {
    throw new Error(
      `No OAuth client configured for "${service}" yet. Run:\n` +
        `  node dist/cli.js config ${service} <client_id> <client_secret>\n` +
        `first (see README.md for how to create these in Google Cloud Console).`
    );
  }

  const client = adapter.oauth.createClient(clientCfg.clientId, clientCfg.clientSecret, REDIRECT_URI);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: adapter.oauth.scopes,
  });

  console.log(`Opening your browser to log into the "${label}" ${adapter.displayName} account...`);
  console.log(`If it doesn't open automatically, visit:\n${authUrl}\n`);

  const callbackPromise = waitForOAuthCallback();
  await open(authUrl);
  const code = await callbackPromise;

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const secret = adapter.oauth.toSecret(tokens);
  const displayName = await adapter.oauth.fetchDisplayName(client);

  await keychainSet(service, label, JSON.stringify(secret));
  await upsertAccount({
    service,
    label,
    displayName,
    scopes: adapter.oauth.scopes,
    addedAt: new Date().toISOString(),
  });

  console.log(
    `\nDone. "${label}" -> ${displayName} is now available to every MCP client using this vault — no further login needed.`
  );
}

async function cmdList(): Promise<void> {
  const accounts = await readAccounts();
  if (accounts.length === 0) {
    console.log("No accounts configured yet. Add one with: node dist/cli.js add <service> <label>");
    return;
  }
  for (const a of accounts) {
    console.log(`${a.service.padEnd(10)} ${a.label.padEnd(15)} ${a.displayName}  (added ${a.addedAt})`);
  }
}

async function cmdRemove(service: string, label: string): Promise<void> {
  const removed = await removeAccount(service, label);
  await keychainDelete(service, label);
  console.log(removed ? `Removed ${service}:${label}.` : `No such account: ${service}:${label}.`);
}

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;
  try {
    switch (cmd) {
      case "config": {
        const [service, clientId, clientSecret] = rest;
        if (!service || !clientId || !clientSecret) {
          throw new Error("Usage: vault config <service> <client_id> <client_secret>");
        }
        await cmdConfig(service, clientId, clientSecret);
        break;
      }
      case "add": {
        const [service, label] = rest;
        if (!service || !label) throw new Error("Usage: vault add <service> <label>");
        await cmdAdd(service, label);
        break;
      }
      case "list":
        await cmdList();
        break;
      case "remove": {
        const [service, label] = rest;
        if (!service || !label) throw new Error("Usage: vault remove <service> <label>");
        await cmdRemove(service, label);
        break;
      }
      default:
        console.log(`account-vault-mcp-server CLI

Usage:
  node dist/cli.js config <service> <client_id> <client_secret>   one-time per service
  node dist/cli.js add <service> <label>                          log in one account, e.g.: add gmail work
  node dist/cli.js list                                           show configured accounts
  node dist/cli.js remove <service> <label>

Known services: ${adapters.map((a) => a.service).join(", ")}`);
    }
  } catch (error) {
    console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
