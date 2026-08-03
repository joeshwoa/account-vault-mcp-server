import type { OAuth2Client } from "google-auth-library";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Non-secret metadata about one configured account, stored in data/accounts.json on disk. */
export interface AccountRecord {
  service: string;
  label: string;
  displayName: string;
  scopes: string[];
  addedAt: string;
}

/** Secret credential blob for one account (tokens, API keys, etc.) — shape is adapter-specific. Lives in the macOS Keychain, never on disk. */
export type SecretBlob = Record<string, unknown>;

/** Re-export of the SDK's own result type so every handler is guaranteed structurally compatible with registerTool. */
export type ToolResult = CallToolResult;

export interface ToolContext {
  /** List every configured account, optionally filtered by service. */
  listAccounts(service?: string): Promise<AccountRecord[]>;
  /**
   * Resolve which account a tool call should use. If `label` is given it must match exactly.
   * If omitted, resolves automatically when exactly one account exists for the service.
   * Throws a descriptive, model-safe error otherwise (no accounts / ambiguous / unknown label).
   */
  requireAccount(service: string, label?: string): Promise<AccountRecord>;
  /** Load the secret blob (tokens, API key, etc.) for an account from the Keychain. */
  loadSecret(service: string, label: string): Promise<SecretBlob>;
  /** Persist an updated secret blob (e.g. after a token refresh) back to the Keychain. */
  saveSecret(service: string, label: string, secret: SecretBlob): Promise<void>;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/**
 * One MCP tool contributed by an adapter.
 *
 * `inputSchema` / `handler` args are typed loosely (`any`) on purpose: this interface has to
 * hold many different tools with different Zod schemas in one array (see adapters/index.ts
 * and src/index.ts), so precise per-tool typing lives in each adapter's own schemas.ts /
 * tools.ts, where handlers cast `args` to their real inferred input type.
 */
export interface ToolDef {
  name: string;
  title: string;
  description: string;
  inputSchema: any;
  annotations: ToolAnnotations;
  handler: (args: any, ctx: ToolContext) => Promise<ToolResult>;
}

/**
 * Hooks an adapter implements for a browser-based OAuth2 "add account" flow (src/cli.ts).
 * Use this for any service where accounts are added by signing in through a browser
 * consent screen — Google services, and most other modern SaaS APIs.
 */
export interface OAuth2AuthHooks {
  kind: "oauth2";
  /** Scopes requested during the consent screen. */
  scopes: string[];
  /**
   * Optional shared OAuth client this adapter ships with, used automatically when the user
   * hasn't configured their own — lets accounts be added with zero Google-Cloud-console (or
   * equivalent) setup. Whatever the user saves themselves always takes priority over this;
   * see `resolveOAuth2ClientConfig` in vault/accounts.ts. Leave unset to require every user
   * to configure their own client, same as before this existed.
   */
  defaultClient?: { clientId: string; clientSecret: string };
  createClient(clientId: string, clientSecret: string, redirectUri: string): OAuth2Client;
  /** Turn the token response from the provider into this adapter's SecretBlob shape. */
  toSecret(tokens: {
    refresh_token?: string | null;
    access_token?: string | null;
    expiry_date?: number | null;
  }): SecretBlob;
  /** Resolve a human-readable identity (usually an email address) to show in vault_list_accounts. */
  fetchDisplayName(client: OAuth2Client): Promise<string>;
}

/**
 * Hooks an adapter implements for a static-credential "add account" flow (src/cli.ts) —
 * for services authenticated with an API key, personal access token, project URL + key
 * pair, etc. instead of a browser OAuth dance. No app-level "config" step is needed for
 * these; each account's credentials are self-contained.
 */
export interface ApiKeyAuthHooks {
  kind: "apikey";
  /** Fields the CLI prompts for when adding an account, in order. */
  fields: Array<{
    /** Key used in the `values` object passed to toSecret/verifyAndFetchDisplayName. */
    name: string;
    /** Prompt text shown to the user. */
    label: string;
    /** Mask input on the terminal (for API keys, tokens, secrets). */
    secret?: boolean;
  }>;
  /** Turn the raw field values the user typed into this adapter's SecretBlob shape. */
  toSecret(values: Record<string, string>): SecretBlob;
  /**
   * Verify the credentials actually work (e.g. one lightweight API call) and resolve a
   * human-readable identity for vault_list_accounts (e.g. a project or workspace name).
   * Throw a clear error if verification fails — this is the only feedback a non-technical
   * user gets that they mistyped something.
   */
  verifyAndFetchDisplayName(secret: SecretBlob): Promise<string>;
}

export type AuthHooks = OAuth2AuthHooks | ApiKeyAuthHooks;

/** A connector: a set of tools plus the auth flow needed to log an account into it. */
export interface Adapter {
  /** Short id used as the tool-name prefix and the `service` value everywhere, e.g. "gmail". */
  service: string;
  displayName: string;
  auth: AuthHooks;
  tools: ToolDef[];
}
