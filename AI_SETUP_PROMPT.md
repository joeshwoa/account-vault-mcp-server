# Setup prompt — paste this to your AI assistant

Not comfortable with the command line? Copy everything between the `BEGIN PROMPT` and
`END PROMPT` lines below and paste it as a message to an AI assistant that can run
terminal commands and edit files on your Mac — Claude Code, Cursor, or similar. It will
set everything up for you, and it's instructed to pause and check with you before
anything that needs a decision or your credentials.

Prefer doing it yourself instead? Skip this file and follow `README.md` — it's the exact
same steps, just typed by you instead of an AI.

---BEGIN PROMPT---

I need help setting up a local MCP server called "account-vault-mcp-server" that's already
on my computer. It lets AI tools like you use several of my Gmail accounts (personal,
work, etc.) at once, without me having to log out and back in to switch between them.

Please work through this step by step, and stop to check with me before anything that
needs a decision or my credentials — don't run ahead on your own.

1. Find the "account-vault-mcp-server" folder (ask me for its path if you can't locate
   it). If it isn't on this computer yet, clone it first:
   `git clone https://github.com/joeshwoa/account-vault-mcp-server.git`
   Open and read its README.md fully before doing anything else.

2. In that folder, run `npm install` then `npm run build`. Show me the output and confirm
   there are no errors before continuing.

3. Ask me which app I want to connect this to right now: Claude Desktop, Claude Code,
   Cursor, or something else. Then edit that app's config file yourself, directly with
   your own file tools — I should not need to open any settings screen or edit any file
   by hand. Specifically: read the file, parse it as JSON, add an `account-vault` entry
   inside its existing `mcpServers` object (create that object if it doesn't exist yet)
   using `"command": "node"` and the absolute path to this folder's `dist/index.js` in
   `args` — using JSON.parse/JSON.stringify or equivalent, never raw text
   editing/typing, and never touching any other key already in the file. Back up the
   original file first, show me a diff before saving, and confirm the result is still
   valid JSON. Then tell me to fully quit and reopen that app (for Claude Desktop:
   Cmd+Q, not just closing the window).

4. Check `src/adapters/gmail/shared-client.ts` yourself first. If `SHARED_GMAIL_CLIENT`
   is already filled in (not `null`), this build has zero-setup Gmail sign-in built in —
   skip straight to step 5, no need to ask me anything here. Only if it's `null`: ask
   whether I already have a Google Cloud OAuth Client ID and Secret. If not, walk me
   through README.md's "Create a Google OAuth client" section one step at a time — pause
   after each step and wait for me to confirm I've done it, since it involves my Google
   account and I need to click through it myself. Never ask me for a password — only the
   Client ID and Client Secret at the very end of that process.

5. Run `npm run panel`. This opens a page in my browser at http://127.0.0.1:4790 — from
   here, hand off to me directly: if you skipped step 4 above, "Connect Gmail" already
   works with no client info needed; otherwise I'll paste the Client ID/Secret into the
   page myself first. Either way I'll click "Connect Gmail" to log into each account I
   want (I can add more than one, one at a time), and Google will show an "unverified
   app" warning that's expected — I'll click through it myself. Wait for me to say I've
   added at least one account before continuing — don't try to do this part for me, it
   needs my own browser sign-in.

6. Help me confirm the connection worked: for Claude Code, run `claude mcp list` yourself
   and show me the result. For Claude Desktop or Cursor, there's no command-line check —
   ask me to glance at Settings -> Developer (Claude Desktop) or its MCP settings
   (Cursor) and tell you whether `account-vault` shows as running.

7. Ask me to test it by typing "list my configured vault accounts" in that app, and
   confirm the account(s) I added show up in the response.

8. Optional — only if I ask you to publish this to GitHub: check whether the `gh` command
   is installed (`gh --version`). If it isn't, tell me to install it (`brew install gh` on
   a Mac with Homebrew, or point me to https://cli.github.com) and stop until I confirm
   it's installed. Then run `gh auth login` and let me complete that login myself in the
   browser — don't try to do it for me. Once I'm authenticated, ask me whether I want the
   repository public or private, then from inside the project folder run:
   `gh repo create account-vault-mcp-server --source=. --remote=origin --push` (add
   `--public` or `--private` based on my answer). Show me the repository URL it prints at
   the end.

Stay inside this project folder for all commands. Ask before overwriting, deleting, or
force-pushing anything.

---END PROMPT---
