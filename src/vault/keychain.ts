import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Keychain "service" every entry is stored under; the service:label pair is the Keychain "account". */
const KEYCHAIN_SERVICE = "account-vault-mcp-server";

function keychainAccount(service: string, label: string): string {
  return `${service}:${label}`;
}

/** Fail fast with a clear message if we're not on macOS, instead of a confusing ENOENT from `security`. */
export function assertMacKeychainSupport(): void {
  if (process.platform !== "darwin") {
    throw new Error(
      `account-vault-mcp-server stores secrets in the macOS Keychain via the "security" CLI, but this ` +
        `is running on "${process.platform}". See README.md -> "Security notes" for how to swap in a ` +
        `different secret store on other platforms.`
    );
  }
}

/** Create or overwrite the secret stored for one service:label pair. */
export async function keychainSet(service: string, label: string, secretJson: string): Promise<void> {
  await execFileAsync("security", [
    "add-generic-password",
    "-a",
    keychainAccount(service, label),
    "-s",
    KEYCHAIN_SERVICE,
    "-w",
    secretJson,
    "-U",
  ]);
}

/** Read the secret for one service:label pair, or null if nothing is stored. */
export async function keychainGet(service: string, label: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("security", [
      "find-generic-password",
      "-a",
      keychainAccount(service, label),
      "-s",
      KEYCHAIN_SERVICE,
      "-w",
    ]);
    return stdout.replace(/\n$/, "");
  } catch {
    return null;
  }
}

/** Delete the secret for one service:label pair. Safe to call even if nothing is stored. */
export async function keychainDelete(service: string, label: string): Promise<void> {
  try {
    await execFileAsync("security", [
      "delete-generic-password",
      "-a",
      keychainAccount(service, label),
      "-s",
      KEYCHAIN_SERVICE,
    ]);
  } catch {
    // Nothing to delete — fine.
  }
}
