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
   Cursor, or something else. Then follow the matching part of README.md under "Connect
   it to your MCP client(s)" to edit that app's config file — use the absolute path to
   this folder's `dist/index.js`. Back up the config file before changing it, and show me
   the diff before saving.

4. Ask whether I already have a Google Cloud OAuth Client ID and Secret for this. If not,
   walk me through README.md's "Create a Google OAuth client" section one step at a time —
   pause after each step and wait for me to confirm I've done it, since it involves my
   Google account and I need to click through it myself. Never ask me for a password —
   only the Client ID and Client Secret at the very end of that process.

5. Once I have a Client ID and Secret, run:
   `node dist/cli.js config gmail <the client id> <the client secret>`

6. Ask me what to call my first account (e.g. "personal" or "work"), then run:
   `node dist/cli.js add gmail <that label>`
   This opens my browser to log into Google — wait for me to say I've finished before
   continuing. Then run `node dist/cli.js list` and show me the result so I can confirm it
   worked. Repeat for every other account I want to add.

7. Tell me to fully quit and reopen the app from step 3 (Claude Desktop / Cursor) — or for
   Claude Code, run `claude mcp list` to confirm the server shows up there instead.

8. Ask me to test it by typing "list my configured vault accounts" in that app, and
   confirm the account(s) I added show up in the response.

9. Optional — only if I ask you to publish this to GitHub: check whether the `gh` command
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
