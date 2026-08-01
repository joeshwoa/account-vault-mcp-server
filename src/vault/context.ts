import { readAccounts } from "./store.js";
import { keychainGet, keychainSet } from "./keychain.js";
import type { AccountRecord, SecretBlob, ToolContext } from "../types.js";

/** Wires the JSON account index + Keychain secret store into the ToolContext every adapter tool receives. */
export function createToolContext(): ToolContext {
  async function listAccounts(service?: string): Promise<AccountRecord[]> {
    const all = await readAccounts();
    return service ? all.filter((a) => a.service === service) : all;
  }

  async function requireAccount(service: string, label?: string): Promise<AccountRecord> {
    const matches = await listAccounts(service);

    if (matches.length === 0) {
      throw new Error(
        `No "${service}" accounts are configured yet. From the account-vault-mcp-server project, run: ` +
          `node dist/cli.js add ${service} <label>`
      );
    }

    if (label) {
      const found = matches.find((a) => a.label === label);
      if (!found) {
        const known = matches.map((a) => a.label).join(", ");
        throw new Error(
          `No "${service}" account labeled "${label}". Configured labels: ${known}. ` +
            `Call vault_list_accounts to check what's available.`
        );
      }
      return found;
    }

    if (matches.length === 1) return matches[0];

    const known = matches.map((a) => a.label).join(", ");
    throw new Error(
      `Multiple "${service}" accounts are configured (${known}) — pass an "account" argument to say ` +
        `which one to use. Call vault_list_accounts if you need to check first.`
    );
  }

  async function loadSecret(service: string, label: string): Promise<SecretBlob> {
    const raw = await keychainGet(service, label);
    if (!raw) {
      throw new Error(
        `No credentials found in the macOS Keychain for ${service}:${label}. The account index and the ` +
          `Keychain entry are out of sync — try re-adding the account: node dist/cli.js add ${service} ${label}`
      );
    }
    return JSON.parse(raw) as SecretBlob;
  }

  async function saveSecret(service: string, label: string, secret: SecretBlob): Promise<void> {
    await keychainSet(service, label, JSON.stringify(secret));
  }

  return { listAccounts, requireAccount, loadSecret, saveSecret };
}
