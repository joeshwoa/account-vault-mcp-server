/**
 * Optional shared Google OAuth client. When filled in below, anyone can connect a Gmail
 * account with zero Google Cloud Console setup — the panel uses this automatically until/
 * unless someone configures their own client instead (which always takes priority; see
 * "Use your own client" in the control panel, or `node dist/cli.js config gmail ...`).
 *
 * Why a secret embedded in source is fine here: Google's own guidance for "installed
 * application" OAuth clients (this one is registered as type "Desktop app") is that this
 * kind of client secret can't be kept truly confidential in a distributed app anyway, so
 * it isn't treated as sensitive the way a server-side web app's secret would be (RFC 8252;
 * see Google's identity docs on installed apps). What it gates is which registered "app
 * identity" shows on Google's consent screen and which quota/user-cap applies — never
 * access to any account's data, which always still additionally requires that account's own
 * owner to click "Allow" on their own consent screen.
 *
 * Real tradeoffs of relying on this instead of your own client (see README.md):
 *   - Every sign-in shows Google's "Google hasn't verified this app" interstitial.
 *   - Capped at ~100 total Google accounts across everyone using this shared client while
 *     it's unverified — could stop accepting new sign-ins if this project is used by many
 *     people at once.
 *   - Everyone relying on it shares one Gmail API quota/rate limit.
 *
 * To activate it: create one OAuth client (README.md -> "Create a Google OAuth client"),
 * then fill in its values below. Leave both as null to disable the shared default entirely
 * — every user will then need to configure their own, exactly like before this existed.
 */
export const SHARED_GMAIL_CLIENT: { clientId: string; clientSecret: string } | null = null;
