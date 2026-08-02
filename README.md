# account-vault-mcp-server

**Repo:** https://github.com/joeshwoa/account-vault-mcp-server

Claude's (and ChatGPT's, and every other app's) built-in Gmail connector holds exactly one
Google account at a time — connecting a second one logs the first one out. This is a local
MCP server that fixes that: it holds **many** logged-in accounts at once and lets any MCP
client pick the right one per request, with no logout/login switching, ever again.

This is a plain [Model Context Protocol](https://modelcontextprotocol.io) server talking
stdio — nothing in it is specific to any one app. It works identically in **Claude
Desktop, Claude Code, Cursor, Windsurf, Cline, Continue, VS Code's MCP support, or any
other MCP-compatible client or agent**, including ones not listed here, since MCP is an
open standard, not a Claude or Cursor feature.

It runs entirely on your machine. Nothing is hosted, nothing but Google ever sees your
tokens, and this README tells you exactly where they're stored.

## Quick install

**Already installed? The easiest way, zero typing, ever:** double-click
**`Open Account Vault.command`**, the file sitting right in this folder. It opens the
control panel in your browser. That's the whole interaction. (The very first time, macOS
may warn "unidentified developer" since you made this file yourself — right-click it and
choose **Open** once instead of double-clicking, confirm, and it'll open normally every
time after that.)

**Not installed yet, and would rather an AI handle that part too?** Open
[`AI_SETUP_PROMPT.md`](./AI_SETUP_PROMPT.md), copy everything in it, and paste it as a
message to an AI coding assistant that can run terminal commands on your Mac — Claude
Code, Cursor, or similar. It installs everything, wires it into your AI app, then hands
you off to the same double-click panel above for the account part.

**Prefer doing it all by hand?** Keep reading — everything below is the same steps typed
by you, using the command line instead of double-clicking.

## How this actually works (read this before you rely on it)

You asked for something that works like a **wallet** — log an account in once, and it's
just available forever, and it should be **dynamic**: adding things shouldn't require
rewriting code. Here's exactly how much of that is true, and where the real limits are:

- **Adding another account for a service that's already supported (e.g. a 3rd, 4th, 5th
  Gmail account) is fully dynamic.** Run one command, log in once in the browser, done —
  zero code changes, and every MCP client using this server picks it up immediately.
- **Adding support for a brand-new *kind* of connector (Google Calendar, Notion, Slack,
  ...) is not literally automatic — no system can do that, because every service has a
  different API and a different login flow.** What this project gives you instead is a
  small, consistent template (an "adapter") so adding one is a contained, ~30-60 minute
  task instead of a rewrite. The vault core, the CLI, and every MCP client config never
  change when you add one. See [Adding a new connector](#adding-a-new-connector) below.

This ships with one adapter built and fully tested: **Gmail**. It's built as the reference
implementation the pattern is proven against.

## Not Google-only, and not a replacement for your other MCP connectors

Two things worth being precise about:

**It's not Google/OAuth-specific.** The adapter interface (`src/types.ts`) supports two
kinds of login: a browser OAuth2 flow (what Gmail uses) and a static API-key flow — paste
a token/key once, no browser involved — for services like Supabase, most SaaS APIs, or
anything else that authenticates with an API key instead of an OAuth dance. See
[Adding a new connector](#adding-a-new-connector) for a complete worked example of the
API-key style.

**It doesn't replace, duplicate, or touch your other MCP connectors** — the official
Gmail connector, Supabase's own MCP, or anything else you already have connected. This
server's tools live under their own names (`gmail_search_messages`, not whatever the
official Gmail connector calls its search tool), so it sits alongside what you already
use rather than competing with it.

One important, honest limit: **this vault cannot make an already-existing MCP connector
(the official Gmail connector, Supabase's official MCP, etc.) switch which account *it*
is using.** Those run as hosted services — their credentials live server-side with
Anthropic, or with Supabase, with no local hook for anything (this tool included) to
reach in and swap. That's an access boundary, not a missing feature — no locally-run tool
could do that for a hosted connector, by design, since allowing it would be a security
hole. What this vault gives you instead is a *second, independent* way to reach the same
kind of account (Gmail today), one that was built from the ground up to hold many
accounts and switch between them live, with its own tools, no restart, no re-auth. For a
connector you self-host and run as a local process yourself (rather than through Claude's
hosted connector settings), a credential-switching proxy in front of it is *sometimes*
possible depending on how that specific server reads its credentials — but it's a
per-server integration, not something generic, and most self-hosted MCP servers cache
their credentials at startup, so even that path usually needs a reconnect rather than a
truly live mid-conversation switch. If you have a specific self-hosted server in mind,
say which one and that's a real, scoped thing to look into.

## Security notes

- Every account's OAuth tokens are stored in **your macOS Keychain** (via the built-in
  `security` command), not in a plaintext file — even though this project lives on a
  portable drive. Only non-secret metadata (an account's label and email address) sits in
  `data/accounts.json` on disk.
- This currently only works on macOS, because it's built on the macOS Keychain. See
  [Troubleshooting](#troubleshooting) if you ever need to run it elsewhere.
- Because this drive is portable, turn on **FileVault** (or equivalent full-disk
  encryption) on any machine it's plugged into — the Keychain protects the tokens, but
  there's no reason to make it easier than necessary for someone with physical access.
- The Gmail scope this server requests (`gmail.compose`) technically permits sending mail,
  because Google doesn't offer a narrower "drafts only, never send" scope. This server
  **intentionally never calls the send endpoint** — every write tool only creates or
  updates drafts, which you review and send yourself from Gmail. If you deliberately want
  auto-send later, that's a conscious change to `src/adapters/gmail/tools.ts`, not
  something this ships with.
- `npm run build` runs TypeScript compilation only; nothing here phones home or reports
  usage anywhere.

## One-time setup

### 0. Get the code built

Already have this exact folder (e.g. this is Joshua's original copy on the portable
SSD)? `npm install` and `npm run build` have already been run — `dist/` is ready to go,
skip to step 1.

Starting fresh from GitHub instead (a different machine, or someone else trying this)?

```bash
git clone https://github.com/joeshwoa/account-vault-mcp-server.git
cd account-vault-mcp-server
npm install
npm run build
```

Either way, if you ever change the source or pull updates, re-run `npm install && npm run build`.

### 1. Create a Google OAuth client (one-time, reused for every Gmail account you add)

You only do this once — the same client ID/secret works for unlimited Gmail accounts.

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and create a new
   project (any name).
2. **APIs & Services → Library** → search "Gmail API" → **Enable**.
3. **APIs & Services → OAuth consent screen** (may be labeled "Google Auth Platform") →
   **Get started** → fill in an app name and your email → user type **External** (unless
   you're on Google Workspace and want to restrict this to your org) → step through the
   wizard.
4. Still on the consent screen, open **Data Access** → **Add or remove scopes** → add
   these four, then save:
   - `https://www.googleapis.com/auth/gmail.readonly`
   - `https://www.googleapis.com/auth/gmail.labels`
   - `https://www.googleapis.com/auth/gmail.compose`
   - `https://www.googleapis.com/auth/userinfo.email`
5. Open **Audience** → **Test users** → add every Gmail address you plan to connect (your
   personal Gmail, your work Gmail, etc.). Google blocks OAuth for External apps in
   Testing mode unless the account is listed here — this step is easy to miss.
6. **APIs & Services → Credentials** (or **Google Auth Platform → Clients**) → **Create
   Client** → Application type **Desktop app** → name it anything → **Create**. Copy the
   **Client ID** and **Client Secret** it gives you.

### 2. Save the OAuth client, then log in each account

Easiest: skip everything below and run `npm run panel` instead — see
[Local control panel](#local-control-panel). What follows is the command-line version of
the same thing.

From this folder:

```bash
cd /Volumes/PortableSSD/MCP/account-vault-mcp-server

# one-time: paste the Client ID / Client Secret from step 1
node dist/cli.js config gmail <CLIENT_ID> <CLIENT_SECRET>

# once per account — repeat with whatever labels make sense to you
node dist/cli.js add gmail personal
node dist/cli.js add gmail work
```

Each `add` opens your browser to Google's normal sign-in + consent screen. Because the
app is in "Testing" publishing status, Google will show an "unverified app" warning —
that's expected for a personal-use app; click **Advanced → Go to (your app name)** to
continue. Once you approve, the tab confirms and the terminal prints the account's email.

Check what's configured any time with:

```bash
node dist/cli.js list
```

## Local control panel

Double-click **`Open Account Vault.command`** in this folder. Or, from a terminal:

```bash
npm run panel
```

Either way, this starts a small web page at `http://127.0.0.1:4790` (only reachable from this computer —
never exposed to your network) and opens it in your browser automatically. From there you
can, without touching a terminal again:

- Paste your Google OAuth Client ID/Secret (the one-time step from above), for Gmail or
  any future OAuth2 adapter.
- Connect a Gmail account — click "Connect Gmail," give it a label, and it sends you
  through the normal Google sign-in in your browser, then brings you back with the
  account added.
- Add an account for any API-key-based adapter — a plain form for whatever fields that
  service needs.
- See every account currently configured, and remove any of them.
- Check for and apply updates from GitHub with one click.
- Copy the exact MCP config snippet for Claude Desktop, Claude Code, or Cursor, with the
  real path to this folder already filled in.

It's built on the same underlying functions as the CLI (`node dist/cli.js ...`) — nothing
it does is different from, or less safe than, running those commands by hand. Close the
terminal window/tab running it (or Ctrl+C) when you're done; it doesn't need to stay
running for the MCP server itself to work.

## Connect it to your MCP client(s)

This is a standard MCP server (stdio transport) — the exact same server works in every
client. The entry point is:

```
/Volumes/PortableSSD/MCP/account-vault-mcp-server/dist/index.js
```

### Claude Desktop

Edit (or create) `~/Library/Application Support/Claude/claude_desktop_config.json`. If it
already has an `mcpServers` block from something else, add `account-vault` alongside it
rather than replacing the file:

```json
{
  "mcpServers": {
    "account-vault": {
      "command": "node",
      "args": ["/Volumes/PortableSSD/MCP/account-vault-mcp-server/dist/index.js"]
    }
  }
}
```

Restart Claude Desktop afterward. To confirm it connected: start a new chat and click the
tools/hammer icon near the message box — `account-vault-mcp-server`'s tools
(`vault_list_accounts`, `gmail_search_messages`, etc.) should be listed there. (That
config file also lives under Settings -> Developer -> Edit Config if you'd rather get
there through the UI than find the file yourself.)

### Claude Code

```bash
claude mcp add --transport stdio --scope user account-vault -- node /Volumes/PortableSSD/MCP/account-vault-mcp-server/dist/index.js
```

`--scope user` makes it available in every project, not just the current one. Verify with
`claude mcp list`. (If this exact flag syntax has changed by the time you run it, `claude
mcp add --help` will show the current form — the underlying idea, pointing it at
`node .../dist/index.js`, doesn't change.)

### Cursor

Edit (or create) `~/.cursor/mcp.json` for a global setup (available in every project), or
`.cursor/mcp.json` inside one project folder to scope it there:

```json
{
  "mcpServers": {
    "account-vault": {
      "command": "node",
      "args": ["/Volumes/PortableSSD/MCP/account-vault-mcp-server/dist/index.js"]
    }
  }
}
```

### Any other MCP-compatible app

Same pattern everywhere: point it at command `node` with one argument, the absolute path
to `dist/index.js` shown above. That's the entire integration surface — nothing about the
server changes per client.

## Using it

No new commands to learn — once it's connected, just talk to Claude/Cursor/whatever app
you wired it into, the same way you'd talk about anything else. It figures out which
account you mean from context, and asks if it's genuinely unsure.

Things you can say:

- "What's in my personal Gmail unread right now?"
- "Check my work inbox for anything from finance"
- "Search my personal Gmail for that flight confirmation from last week"
- "Draft a reply in my work account to the thread about the Q3 budget" (it'll create the
  draft and tell you it's waiting in Gmail for you to review and send — it never sends on
  its own)
- "What Gmail accounts do I have connected?" (this calls `vault_list_accounts` directly)
- "Archive that email" / "mark it read" / "star it" (once you've looked at a message
  together)

If you have more than one Gmail account configured and don't say which one, it will ask
(or check `vault_list_accounts` itself) instead of guessing and picking the wrong inbox.

**It will never send an email for you.** Every write action is a draft — search, reading,
labels, and drafts are the only things it can touch. You always send from Gmail yourself.

## Tools reference

| Tool | What it does |
|---|---|
| `vault_list_accounts` | List every account configured, across every connector |
| `vault_list_services` | List which connectors this server supports |
| `gmail_search_messages` | Search one account with Gmail's native search syntax |
| `gmail_get_message` | Full headers + plain-text body of one message |
| `gmail_get_thread` | Every message in a conversation, in order |
| `gmail_list_labels` | List labels and their IDs |
| `gmail_list_drafts` | List saved drafts |
| `gmail_create_draft` | Create a draft (never sends) |
| `gmail_update_draft` | Edit an existing draft (never sends) |
| `gmail_modify_labels` | Add/remove labels on a message (archive, star, mark read, ...) |

## Adding a new connector

The vault core (`src/vault/`), the CLI (`src/cli.ts`), and `src/index.ts` are all generic
— they loop over whatever's in `src/adapters/index.ts` and switch on each adapter's
`auth.kind`, and never need to change. Every adapter picks one of two login styles:

- **`oauth2`** — a browser sign-in + consent screen (what Gmail uses). Right for Google
  services, and most other modern SaaS APIs (Slack, Notion, etc.).
- **`apikey`** — paste a token/key once, no browser involved. Right for services like
  Supabase, or anything else authenticated with an API key or personal access token.

To add one:

1. Copy `src/adapters/gmail/` to `src/adapters/<service>/` as a starting template.
2. In `adapter.ts`, implement `auth` for whichever kind fits the service (see the
   `OAuth2AuthHooks` / `ApiKeyAuthHooks` types in `src/types.ts`, and the example below).
3. In `tools.ts`, write the MCP tools you want (search, read, write, whatever the service
   needs), following the `ToolDef` shape in `src/types.ts`.
4. Add the new adapter to the array in `src/adapters/index.ts`. That's it —
   `vault_list_accounts`, the CLI's `add`/`list`/`remove` commands, and every connected
   MCP client pick it up automatically, with no other code touched.
5. `npm run build`. OAuth2 services need `node dist/cli.js config <service> ...` once
   first; API-key services skip straight to `add`.

### Worked example: an API-key adapter

This is the entire `auth` block for a hypothetical API-key-based service — no browser
flow, no app-level `config` step:

```ts
// src/adapters/example-service/adapter.ts
import type { Adapter, ApiKeyAuthHooks } from "../../types.js";
import { exampleServiceTools } from "./tools.js";

const auth: ApiKeyAuthHooks = {
  kind: "apikey",
  fields: [
    { name: "apiKey", label: "API key", secret: true },
    { name: "projectUrl", label: "Project URL" },
  ],
  toSecret(values) {
    return { apiKey: values.apiKey, projectUrl: values.projectUrl };
  },
  async verifyAndFetchDisplayName(secret) {
    // Make one lightweight authenticated call to confirm the key works, and return
    // something human-readable (a project/workspace name) for vault_list_accounts.
    const res = await fetch(`${secret.projectUrl}/whoami`, {
      headers: { Authorization: `Bearer ${secret.apiKey}` },
    });
    if (!res.ok) throw new Error(`Couldn't verify credentials (${res.status}). Check the API key and URL.`);
    const data = await res.json();
    return data.projectName ?? String(secret.projectUrl);
  },
};

export const exampleServiceAdapter: Adapter = {
  service: "example-service",
  displayName: "Example Service",
  auth,
  tools: exampleServiceTools,
};
```

Running `node dist/cli.js add example-service work` then prompts for **API key** (masked)
and **Project URL**, verifies them, and stores the result in the Keychain — same
`vault_list_accounts`, same automatic per-call account switching, same everything else,
for free.

## Publish this on GitHub

This folder is already a git repository with an initial commit — `node_modules/`, `dist/`,
and your account data/OAuth secrets (`data/*.json`) are all git-ignored, so nothing
sensitive is in the commit. Publishing it is one command if you have the
[GitHub CLI](https://cli.github.com) installed:

```bash
cd /Volumes/PortableSSD/MCP/account-vault-mcp-server
gh auth login          # one-time, opens your browser — skip if already logged in
gh repo create account-vault-mcp-server --source=. --remote=origin --push --private
```

Use `--public` instead of `--private` if you want it open. That's it — `gh` creates the
repository on your GitHub account and pushes this commit in one step.

No `gh` installed, or don't want to use a terminal at all? Two other options:

- Install it first: `brew install gh` (if you have Homebrew), then run the block above.
- Fully manual: create a new, **empty** repository at [github.com/new](https://github.com/new)
  (don't check "Add a README" — this folder already has one), then run:
  ```bash
  cd /Volumes/PortableSSD/MCP/account-vault-mcp-server
  git remote add origin <the URL GitHub gives you>
  git push -u origin main
  ```

`AI_SETUP_PROMPT.md` step 9 also covers this if you'd rather have an AI assistant drive it
interactively with you.

**Why I couldn't just do this step for you:** publishing needs your GitHub credentials,
and I intentionally don't have a way to take those from you in chat — pasting a token here
would be a real way to leak it. Everything up to the push is already done for you either
way.

## Staying up to date

Every time the server starts, it does one quick, read-only, non-blocking check against
GitHub (`git ls-remote` — it doesn't download or change anything) and prints a note to
the logs if a newer version is available. It never updates itself silently; applying an
update is always something you explicitly run:

```bash
node dist/cli.js check-update   # just look, changes nothing
node dist/cli.js update         # pull + npm install + npm run build
```

`update` only fast-forwards — if you've made local edits (like a custom adapter) it
refuses instead of overwriting them, and tells you to commit or stash first. After it
finishes, fully restart your MCP app (or reconnect the server) so it picks up the new
code.

## Troubleshooting

- **"No accounts configured yet"** — run `node dist/cli.js list` to confirm, then `add`.
- **"Gmail rejected the request (401/403)"** — the token was likely revoked. Re-run
  `node dist/cli.js add gmail <label>` to log in again.
- **Google did not return a refresh_token** — Google only issues one the *first* time an
  account consents. Go to
  [myaccount.google.com/permissions](https://myaccount.google.com/permissions), remove
  access for your app, then run `add` again.
- **"Port 8765 is already in use"** (during `add`) — something else is using that port;
  close it and retry, or change `REDIRECT_PORT` in `src/cli.ts` and rebuild.
- **The control panel won't start / port 4790 in use** — something else is already using
  that port (maybe you already have the panel open in another tab/window — check there
  first). Close whatever's using it, or change `PORT` in `src/web/server.ts` and rebuild.
- **Running on something other than macOS** — this build refuses to start because it
  relies on the macOS Keychain (`src/vault/keychain.ts`). To run elsewhere, swap that
  module for a different secret store (e.g. an OS-appropriate credential manager, or an
  encrypted file) — the rest of the codebase only talks to it through the `ToolContext`
  interface in `src/types.ts`, so nothing else needs to change.

## Removing an account

```bash
node dist/cli.js remove gmail <label>
```

This deletes both the Keychain entry and the entry in `data/accounts.json`.
