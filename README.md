# account-vault-mcp-server

Claude's (and ChatGPT's, and every other app's) built-in Gmail connector holds exactly one
Google account at a time — connecting a second one logs the first one out. This is a local
MCP server that fixes that: it holds **many** logged-in accounts at once and lets any MCP
client (Claude Desktop, Claude Code, Cursor, ...) pick the right one per request, with no
logout/login switching, ever again.

It runs entirely on your machine. Nothing is hosted, nothing but Google ever sees your
tokens, and this README tells you exactly where they're stored.

## Quick install

**Not a developer, or just want the easy path?** Open [`AI_SETUP_PROMPT.md`](./AI_SETUP_PROMPT.md),
copy everything in it, and paste it as a message to an AI coding assistant that can run
terminal commands on your Mac — Claude Code, Cursor, or similar. It walks through
installing, connecting your MCP app, and adding your Gmail accounts, pausing to check with
you at every step that needs a decision or your credentials.

**Prefer doing it by hand?** Keep reading — everything below is the same steps, typed by
you instead of an AI.

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

### 0. Already done for you

`npm install` and `npm run build` have already been run in this folder — `dist/` is ready
to go. If you ever move this folder, or change the source, re-run:

```bash
cd /Volumes/PortableSSD/MCP/account-vault-mcp-server
npm install
npm run build
```

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

Restart Claude Desktop afterward.

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
— they loop over whatever's in `src/adapters/index.ts` and never need to change. To add
Google Calendar, Notion, Slack, or anything else:

1. Copy `src/adapters/gmail/` to `src/adapters/<service>/` as a starting template.
2. In `adapter.ts`, implement the `oauth` hooks (`createClient`, `toSecret`,
   `fetchDisplayName`) for the new service's OAuth flow — Google services can mostly reuse
   the same pattern; other providers just need their own token endpoint wired into
   `google-auth-library`'s `OAuth2Client`-equivalent, or a different `google-auth-library`
   client entirely if it's not a Google API.
3. In `tools.ts`, write the MCP tools you want (search, read, write, whatever the service
   needs), following the `ToolDef` shape in `src/types.ts`.
4. Add the new adapter to the array in `src/adapters/index.ts`. That's it — `vault_list_accounts`,
   the CLI's `add`/`list`/`remove` commands, and every connected MCP client pick it up
   automatically, with no other code touched.
5. `npm run build`, then `node dist/cli.js config <service> ...` and `add` as usual.

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
