#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { adapters } from "./adapters/index.js";
import { createToolContext } from "./vault/context.js";
import { assertMacKeychainSupport } from "./vault/keychain.js";
import { checkForUpdates } from "./vault/update.js";

const server = new McpServer({
  name: "account-vault-mcp-server",
  version: "1.0.0",
});

const ctx = createToolContext();

// --- Generic vault tools, available regardless of which adapters are installed ---

server.registerTool(
  "vault_list_accounts",
  {
    title: "List Vault Accounts",
    description: `List every account currently logged into the vault, across every connector (Gmail today; more as adapters are added).

Call this first whenever you're not sure which account label to use, or when the user refers to "my work email" / "my personal account" and you need to map that to a label.

Args:
  - service (string, optional): filter to one connector, e.g. "gmail". Omit to list all.

Returns each account's service, label, display name (e.g. email address), granted scopes, and when it was added.`,
    inputSchema: { service: z.string().optional().describe('Optional connector id to filter by, e.g. "gmail".') },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async ({ service }) => {
    const accounts = await ctx.listAccounts(service);
    const text =
      accounts.length === 0
        ? `No accounts configured yet${service ? ` for "${service}"` : ""}. Add one from the account-vault-mcp-server project with: node dist/cli.js add <service> <label>`
        : accounts.map((a) => `- [${a.service}] ${a.label} -> ${a.displayName} (added ${a.addedAt})`).join("\n");
    return {
      content: [{ type: "text", text }],
      structuredContent: { count: accounts.length, accounts },
    };
  }
);

server.registerTool(
  "vault_list_services",
  {
    title: "List Vault-Supported Connectors",
    description: `List which connectors this vault server knows how to talk to (Gmail today; more as adapters are added), independent of whether any account is logged in yet.`,
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  async () => {
    const list = adapters.map((a) => ({ service: a.service, displayName: a.displayName }));
    return {
      content: [{ type: "text", text: list.map((s) => `- ${s.service} (${s.displayName})`).join("\n") }],
      structuredContent: { services: list },
    };
  }
);

// --- Adapter-contributed tools: every adapter's tools are registered the same generic way ---
for (const adapter of adapters) {
  for (const tool of adapter.tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      },
      async (args: any) => tool.handler(args, ctx)
    );
  }
}

async function main() {
  assertMacKeychainSupport();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio is reserved for the JSON-RPC protocol stream — log status to stderr only.
  console.error(
    `account-vault-mcp-server running (stdio) — ${adapters.length} connector(s) loaded: ` +
      adapters.map((a) => a.service).join(", ")
  );

  // Best-effort, non-blocking, read-only version check — never delays startup, never applies
  // anything on its own. Just a heads-up printed to stderr; `node dist/cli.js update` applies it.
  void checkForUpdates()
    .then((status) => {
      if (status.checkFailed || status.upToDate) return;
      const behind = status.behindBy ? ` (${status.behindBy} commit${status.behindBy === 1 ? "" : "s"} behind)` : "";
      console.error(
        `[account-vault-mcp-server] Update available${behind} on GitHub — run "node dist/cli.js update" to get it.`
      );
    })
    .catch(() => {});
}

main().catch((error) => {
  console.error("Fatal error starting account-vault-mcp-server:", error);
  process.exit(1);
});
