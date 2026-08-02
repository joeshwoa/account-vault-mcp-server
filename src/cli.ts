#!/usr/bin/env node
import { createServer } from "node:http";
import { stdin as input, stdout as output } from "node:process";
import open from "open";
import { adapters } from "./adapters/index.js";
import { readAccounts } from "./vault/store.js";
import { assertMacKeychainSupport } from "./vault/keychain.js";
import { checkForUpdates, applyUpdate } from "./vault/update.js";
import {
  getOAuth2ClientConfig,
  saveOAuth2ClientConfig,
  storeOAuth2Account,
  storeApiKeyAccount,
  deleteAccount,
} from "./vault/accounts.js";
import type { Adapter, OAuth2AuthHooks, ApiKeyAuthHooks } from "./types.js";

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

/**
 * Simple no-dependency terminal prompt. Masks input as "*" when opts.secret is set.
 * Character checks use charCodeAt rather than embedding raw control-character literals
 * in source (3 = Ctrl+C / ETX, 127 = DEL, 8 = classic backspace).
 */
function prompt(label: string, opts: { secret?: boolean } = {}): Promise<string> {
  return new Promise((resolve) => {
    output.write(`${label}: `);

    if (!input.isTTY) {
      // Non-interactive stdin (e.g. piped input in a script) — fall back to a plain line read.
      let buf = "";
      const onData = (chunk: string) => {
        buf += chunk;
        const nl = buf.indexOf("\n");
        if (nl >= 0) {
          input.removeListener("data", onData);
          resolve(buf.slice(0, nl).replace(/\r$/, ""));
        }
      };
      input.setEncoding("utf8");
      input.on("data", onData);
      return;
    }

    let value = "";
    input.setRawMode(true);
    input.resume();
    input.setEncoding("utf8");
    const onData = (char: string) => {
      const code = char.charCodeAt(0);
      const isCtrlC = code === 3;
      const isBackspace = code === 127 || code === 8;
      const isEnter = char === "\r" || char === "\n";

      if (isCtrlC) {
        cleanup();
        process.exit(1);
      }
      if (isEnter) {
        cleanup();
        output.write("\n");
        resolve(value);
        return;
      }
      if (isBackspace) {
        if (value.length > 0) {
          value = value.slice(0, -1);
          output.write("\b \b");
        }
        return;
      }
      value += char;
      output.write(opts.secret ? "*" : char);
    };
    function cleanup() {
      input.setRawMode(false);
      input.pause();
      input.removeListener("data", onData);
    }
    input.on("data", onData);
  });
}

async function promptAllFields(fields: ApiKeyAuthHooks["fields"]): Promise<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    values[field.name] = await prompt(field.label, { secret: field.secret });
  }
  return values;
}

async function cmdConfig(service: string, clientId: string, clientSecret: string): Promise<void> {
  const adapter = findAdapter(service);
  if (adapter.auth.kind !== "oauth2") {
    throw new Error(
      `"${service}" doesn't use the OAuth "config" step — its credentials are entered directly in "add". ` +
        `Just run: node dist/cli.js add ${service} <label>`
    );
  }
  await saveOAuth2ClientConfig(service, clientId, clientSecret);
  console.log(`Saved the OAuth client for "${service}". This is one-time per service — now run "add" for each account.`);
}

async function addOAuth2Account(auth: OAuth2AuthHooks, service: string, displayName: string, label: string): Promise<void> {
  const clientCfg = await getOAuth2ClientConfig(service);
  if (!clientCfg) {
    throw new Error(
      `No OAuth client configured for "${service}" yet. Run:\n` +
        `  node dist/cli.js config ${service} <client_id> <client_secret>\n` +
        `first (see README.md for how to create these in Google Cloud Console).`
    );
  }

  const client = auth.createClient(clientCfg.clientId, clientCfg.clientSecret, REDIRECT_URI);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: auth.scopes,
  });

  console.log(`Opening your browser to log into the "${label}" ${displayName} account...`);
  console.log(`If it doesn't open automatically, visit:\n${authUrl}\n`);

  const callbackPromise = waitForOAuthCallback();
  await open(authUrl);
  const code = await callbackPromise;

  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  const record = await storeOAuth2Account(auth, service, label, tokens, client);

  console.log(
    `\nDone. "${label}" -> ${record.displayName} is now available to every MCP client using this vault — no further login needed.`
  );
}

async function addApiKeyAccount(auth: ApiKeyAuthHooks, service: string, displayName: string, label: string): Promise<void> {
  console.log(`Setting up "${label}" (${displayName}). Values you paste here are stored only in the macOS Keychain.`);
  const values = await promptAllFields(auth.fields);

  console.log("Verifying credentials...");
  const record = await storeApiKeyAccount(auth, service, label, values);

  console.log(`\nDone. "${label}" -> ${record.displayName} is now available to every MCP client using this vault.`);
}

async function cmdAdd(service: string, label: string): Promise<void> {
  assertMacKeychainSupport();
  const adapter = findAdapter(service);
  if (adapter.auth.kind === "oauth2") {
    await addOAuth2Account(adapter.auth, service, adapter.displayName, label);
  } else {
    await addApiKeyAccount(adapter.auth, service, adapter.displayName, label);
  }
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
  const removed = await deleteAccount(service, label);
  console.log(removed ? `Removed ${service}:${label}.` : `No such account: ${service}:${label}.`);
}

async function cmdCheckUpdate(): Promise<void> {
  const status = await checkForUpdates();
  if (status.checkFailed) {
    console.log("Couldn't check for updates (offline, or this copy isn't set up with a git remote).");
    return;
  }
  if (status.upToDate) {
    console.log("Up to date.");
    return;
  }
  const behind = status.behindBy != null ? ` (${status.behindBy} commit${status.behindBy === 1 ? "" : "s"} behind)` : "";
  console.log(`Update available${behind}. Run: node dist/cli.js update`);
}

async function cmdUpdate(): Promise<void> {
  console.log("Updating...");
  await applyUpdate((line) => {
    if (line) console.log(line);
  });
  console.log("\nUpdated and rebuilt. Fully restart your MCP app (or reconnect the server) to pick up any tool changes.");
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
      case "check-update":
        await cmdCheckUpdate();
        break;
      case "update":
        await cmdUpdate();
        break;
      default:
        console.log(`account-vault-mcp-server CLI

Usage:
  node dist/cli.js config <service> <client_id> <client_secret>   one-time per OAuth2 service (e.g. gmail)
  node dist/cli.js add <service> <label>                          log in one account, e.g.: add gmail work
  node dist/cli.js list                                           show configured accounts
  node dist/cli.js remove <service> <label>
  node dist/cli.js check-update                                   see if a newer version is on GitHub
  node dist/cli.js update                                         pull, reinstall, and rebuild

Known services: ${adapters.map((a) => `${a.service} (${a.auth.kind})`).join(", ")}`);
    }
  } catch (error) {
    console.error(`\nError: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

main();
