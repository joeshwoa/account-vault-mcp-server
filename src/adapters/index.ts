import type { Adapter } from "../types.js";
import { gmailAdapter } from "./gmail/adapter.js";

/**
 * Every connector this vault knows about lives in this array.
 *
 * Adding a new one (Google Calendar, Notion, Slack, ...) never requires touching the vault
 * core, the CLI, or index.ts — they all iterate this list generically. To add one:
 *   1. Create src/adapters/<service>/ (copy the gmail/ folder as a starting template).
 *   2. Implement `oauth` (see the Adapter / OAuthAdapterHooks types in src/types.ts) and a
 *      `tools` array for the new service.
 *   3. Import the adapter and add it below.
 *
 * See README.md -> "Adding a new connector" for the full walkthrough.
 */
export const adapters: Adapter[] = [gmailAdapter];
