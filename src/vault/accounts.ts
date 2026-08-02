import type { OAuth2Client } from "google-auth-library";
import type { AccountRecord, ApiKeyAuthHooks, OAuth2AuthHooks } from "../types.js";
import { keychainDelete, keychainSet } from "./keychain.js";
import { readConfig, removeAccount as removeAccountRecord, upsertAccount, writeConfig } from "./store.js";

/**
 * Account-management logic shared by the CLI (src/cli.ts) and the local web panel
 * (src/web/server.ts). Both collect input differently (terminal prompts vs. an HTML form,
 * a spawned temp server vs. the panel's own already-running server for the OAuth callback)
 * but end up calling the same functions here to actually verify and persist an account, so
 * there's exactly one place that touches the Keychain and the account index.
 */

export interface OAuth2ClientConfig {
  clientId: string;
  clientSecret: string;
}

export async function getOAuth2ClientConfig(service: string): Promise<OAuth2ClientConfig | null> {
  const config = await readConfig();
  return config.oauthClients[service] ?? null;
}

export async function saveOAuth2ClientConfig(service: string, clientId: string, clientSecret: string): Promise<void> {
  const config = await readConfig();
  config.oauthClients[service] = { clientId, clientSecret };
  await writeConfig(config);
}

/**
 * Finishes an OAuth2 "add account" flow. Called once whoever orchestrated the browser round
 * trip (CLI or web panel) already has a token response and an authenticated client.
 */
export async function storeOAuth2Account(
  auth: OAuth2AuthHooks,
  service: string,
  label: string,
  tokens: { refresh_token?: string | null; access_token?: string | null; expiry_date?: number | null },
  client: OAuth2Client
): Promise<AccountRecord> {
  const secret = auth.toSecret(tokens);
  const displayName = await auth.fetchDisplayName(client);
  await keychainSet(service, label, JSON.stringify(secret));
  const record: AccountRecord = { service, label, displayName, scopes: auth.scopes, addedAt: new Date().toISOString() };
  await upsertAccount(record);
  return record;
}

/** Verifies and stores an API-key account from raw field values (e.g. a submitted form or terminal prompts). */
export async function storeApiKeyAccount(
  auth: ApiKeyAuthHooks,
  service: string,
  label: string,
  values: Record<string, string>
): Promise<AccountRecord> {
  const secret = auth.toSecret(values);
  const displayName = await auth.verifyAndFetchDisplayName(secret);
  await keychainSet(service, label, JSON.stringify(secret));
  const record: AccountRecord = { service, label, displayName, scopes: [], addedAt: new Date().toISOString() };
  await upsertAccount(record);
  return record;
}

export async function deleteAccount(service: string, label: string): Promise<boolean> {
  const removed = await removeAccountRecord(service, label);
  await keychainDelete(service, label);
  return removed;
}
