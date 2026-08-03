import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import type { Adapter } from "../../types.js";
import { GMAIL_SCOPES } from "./client.js";
import { gmailTools } from "./tools.js";
import { SHARED_GMAIL_CLIENT } from "./shared-client.js";

export const gmailAdapter: Adapter = {
  service: "gmail",
  displayName: "Gmail",
  auth: {
    kind: "oauth2",
    scopes: GMAIL_SCOPES,
    defaultClient: SHARED_GMAIL_CLIENT ?? undefined,
    createClient(clientId, clientSecret, redirectUri) {
      return new OAuth2Client(clientId, clientSecret, redirectUri);
    },
    toSecret(tokens) {
      if (!tokens.refresh_token) {
        throw new Error(
          "Google did not return a refresh_token (it only returns one the first time an account grants " +
            "consent). Go to https://myaccount.google.com/permissions, remove access for this app, then run " +
            "the add command again."
        );
      }
      return {
        refresh_token: tokens.refresh_token,
        access_token: tokens.access_token ?? undefined,
        expiry_date: tokens.expiry_date ?? undefined,
      };
    },
    async fetchDisplayName(client) {
      const oauth2 = google.oauth2({ version: "v2", auth: client });
      const { data } = await oauth2.userinfo.get();
      return data.email ?? "(unknown email)";
    },
  },
  tools: gmailTools,
};
