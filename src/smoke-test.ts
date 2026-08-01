#!/usr/bin/env node
/**
 * Headless sanity check: connects to the built server exactly like a real MCP client would,
 * lists its tools, and confirms the expected ones are registered. Doesn't need any accounts
 * configured — it only checks that the server boots and advertises tools correctly.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverEntry = path.join(__dirname, "index.js");

async function main() {
  const client = new Client({ name: "smoke-test", version: "0.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: [serverEntry] });

  await client.connect(transport);
  const { tools } = await client.listTools();

  console.log(`Connected. Server advertises ${tools.length} tool(s):`);
  for (const t of tools) console.log(`  - ${t.name}`);

  const expected = ["vault_list_accounts", "vault_list_services", "gmail_search_messages", "gmail_create_draft"];
  const names = new Set(tools.map((t) => t.name));
  const missing = expected.filter((n) => !names.has(n));

  const accountsResult = await client.callTool({ name: "vault_list_accounts", arguments: {} });
  console.log("\nvault_list_accounts (no accounts configured yet, expected):");
  console.log(JSON.stringify(accountsResult.content, null, 2));

  await client.close();

  if (missing.length > 0) {
    console.error(`\nFAILED: missing expected tools: ${missing.join(", ")}`);
    process.exit(1);
  }
  console.log("\nOK — server boots and registers tools correctly.");
}

main().catch((error) => {
  console.error("Smoke test failed:", error);
  process.exit(1);
});
