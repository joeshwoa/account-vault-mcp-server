import { OAuth2Client } from "google-auth-library";
import { google, gmail_v1 } from "googleapis";
import { readConfig } from "../../vault/store.js";
import type { AccountRecord, ToolContext } from "../../types.js";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.labels",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

interface GmailSecret {
  refresh_token: string;
  access_token?: string;
  expiry_date?: number;
}

/**
 * Build an authenticated Gmail API client for one configured account.
 *
 * `label` is optional — if omitted, resolves automatically when exactly one Gmail account is
 * configured (see ToolContext.requireAccount). Access tokens are refreshed transparently by
 * google-auth-library from the stored refresh_token; the refreshed token is written back to the
 * Keychain in the background so future calls skip an extra refresh round trip.
 */
export async function getGmailClientForLabel(
  ctx: ToolContext,
  label?: string
): Promise<{ gmail: gmail_v1.Gmail; account: AccountRecord }> {
  const account = await ctx.requireAccount("gmail", label);
  const secret = (await ctx.loadSecret("gmail", account.label)) as unknown as GmailSecret;

  const config = await readConfig();
  const clientCfg = config.oauthClients.gmail;
  if (!clientCfg) {
    throw new Error(
      `No Google OAuth client is configured yet. Run "node dist/cli.js config gmail <client_id> <client_secret>" ` +
        `once (see README.md) before adding accounts.`
    );
  }

  const oauth2Client = new OAuth2Client(clientCfg.clientId, clientCfg.clientSecret);
  oauth2Client.setCredentials({
    refresh_token: secret.refresh_token,
    access_token: secret.access_token,
    expiry_date: secret.expiry_date,
  });

  oauth2Client.on("tokens", (tokens) => {
    void ctx
      .saveSecret("gmail", account.label, {
        refresh_token: tokens.refresh_token ?? secret.refresh_token,
        access_token: tokens.access_token ?? secret.access_token,
        expiry_date: tokens.expiry_date ?? secret.expiry_date,
      })
      .catch((err) => console.error(`[gmail:${account.label}] failed to persist refreshed token:`, err));
  });

  const gmail = google.gmail({ version: "v1", auth: oauth2Client });
  return { gmail, account };
}
