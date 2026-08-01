import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AccountRecord } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/vault/store.js -> project root -> data/
export const DATA_DIR = path.resolve(__dirname, "..", "..", "data");
export const ACCOUNTS_FILE = path.join(DATA_DIR, "accounts.json");
export const CONFIG_FILE = path.join(DATA_DIR, "config.json");

interface OAuthClientConfig {
  clientId: string;
  clientSecret: string;
}

export interface VaultConfig {
  /** Keyed by service id, e.g. "gmail". One OAuth client per service, reused for every account you add. */
  oauthClients: Record<string, OAuthClientConfig>;
}

async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readAccounts(): Promise<AccountRecord[]> {
  try {
    const raw = await fs.readFile(ACCOUNTS_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return [];
    throw err;
  }
}

export async function writeAccounts(accounts: AccountRecord[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2) + "\n", { mode: 0o600 });
}

export async function upsertAccount(record: AccountRecord): Promise<void> {
  const accounts = await readAccounts();
  const idx = accounts.findIndex((a) => a.service === record.service && a.label === record.label);
  if (idx >= 0) accounts[idx] = record;
  else accounts.push(record);
  await writeAccounts(accounts);
}

export async function removeAccount(service: string, label: string): Promise<boolean> {
  const accounts = await readAccounts();
  const next = accounts.filter((a) => !(a.service === service && a.label === label));
  const changed = next.length !== accounts.length;
  if (changed) await writeAccounts(next);
  return changed;
}

export async function readConfig(): Promise<VaultConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return { oauthClients: {} };
    throw err;
  }
}

export async function writeConfig(config: VaultConfig): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
}
