import type { gmail_v1 } from "googleapis";
import type { ToolDef } from "../../types.js";
import { getGmailClientForLabel } from "./client.js";
import { describeGmailError } from "./errors.js";
import { buildRawMessage } from "./mime.js";
import {
  SearchMessagesSchema,
  type SearchMessagesInput,
  GetMessageSchema,
  type GetMessageInput,
  GetThreadSchema,
  type GetThreadInput,
  ListLabelsSchema,
  type ListLabelsInput,
  ListDraftsSchema,
  type ListDraftsInput,
  CreateDraftSchema,
  type CreateDraftInput,
  UpdateDraftSchema,
  type UpdateDraftInput,
  ModifyLabelsSchema,
  type ModifyLabelsInput,
} from "./schemas.js";

const MESSAGE_BODY_CHAR_LIMIT = 8000;

function headerMap(headers: gmail_v1.Schema$MessagePartHeader[] | null | undefined): Record<string, string> {
  const map: Record<string, string> = {};
  for (const h of headers ?? []) {
    if (h.name) map[h.name] = h.value ?? "";
  }
  return map;
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function extractPlainTextBody(payload: gmail_v1.Schema$MessagePart | null | undefined): string {
  if (!payload) return "";
  const data = payload.body?.data;
  if (payload.mimeType === "text/plain" && data) {
    return decodeBase64Url(data);
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const found = extractPlainTextBody(part);
      if (found) return found;
    }
  }
  if (payload.mimeType === "text/html" && data) {
    return decodeBase64Url(data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  return "";
}

async function fetchMessageSummaries(gmail: gmail_v1.Gmail, ids: string[]) {
  return Promise.all(
    ids.map(async (id) => {
      const { data } = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "metadata",
        metadataHeaders: ["Subject", "From", "To", "Date"],
      });
      const headers = headerMap(data.payload?.headers);
      return {
        id: data.id ?? id,
        thread_id: data.threadId ?? "",
        snippet: data.snippet ?? "",
        subject: headers["Subject"] ?? "(no subject)",
        from: headers["From"] ?? "",
        to: headers["To"] ?? "",
        date: headers["Date"] ?? "",
        label_ids: data.labelIds ?? [],
      };
    })
  );
}

const searchMessagesTool: ToolDef = {
  name: "gmail_search_messages",
  title: "Search Gmail Messages",
  description: `Search a Gmail account using Gmail's native search syntax (same as the Gmail search box).

Args:
  - account (string, optional): which configured Gmail account to search, by label. Required if more than one is configured. Call vault_list_accounts to see labels.
  - query (string, required): Gmail search syntax, e.g. "from:boss@company.com is:unread", "subject:invoice after:2026/07/01", "has:attachment newer_than:7d".
  - max_results (number, 1-25, default 10)

Returns JSON with each match's id, thread_id, subject, from, to, date, snippet, and label_ids. Use the id with gmail_get_message or gmail_get_thread to read the full message.

Examples:
  - "check my work inbox for anything unread from finance" -> account="work", query="is:unread from:finance"
  - "any invoices this month in my personal gmail" -> account="personal", query="invoice after:2026/07/01"`,
  inputSchema: SearchMessagesSchema,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args, ctx) => {
    try {
      const input = args as SearchMessagesInput;
      const { gmail, account } = await getGmailClientForLabel(ctx, input.account);
      const { data } = await gmail.users.messages.list({
        userId: "me",
        q: input.query,
        maxResults: input.max_results,
      });
      const ids = (data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
      const messages = await fetchMessageSummaries(gmail, ids);

      const lines = [
        `# Gmail search — ${account.label} (${account.displayName})`,
        `Query: \`${input.query}\``,
        "",
        messages.length ? `Found ${messages.length} message(s):` : `No messages matched "${input.query}".`,
        "",
      ];
      for (const m of messages) {
        lines.push(`## ${m.subject}`);
        lines.push(`- id: ${m.id}`);
        lines.push(`- From: ${m.from}`);
        lines.push(`- Date: ${m.date}`);
        lines.push(`- ${m.snippet}`);
        lines.push("");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          account: account.label,
          query: input.query,
          count: messages.length,
          result_size_estimate: data.resultSizeEstimate ?? messages.length,
          messages,
        },
      };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: describeGmailError(error) }] };
    }
  },
};

const getMessageTool: ToolDef = {
  name: "gmail_get_message",
  title: "Get Gmail Message",
  description: `Fetch the full content (headers + plain-text body) of one Gmail message.

Args:
  - account (string, optional)
  - message_id (string, required): from gmail_search_messages

Returns subject, from, to, date, label_ids, and the plain-text body (truncated past ${MESSAGE_BODY_CHAR_LIMIT} characters).`,
  inputSchema: GetMessageSchema,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args, ctx) => {
    try {
      const input = args as GetMessageInput;
      const { gmail, account } = await getGmailClientForLabel(ctx, input.account);
      const { data } = await gmail.users.messages.get({ userId: "me", id: input.message_id, format: "full" });
      const headers = headerMap(data.payload?.headers);
      const fullBody = extractPlainTextBody(data.payload);
      const truncated = fullBody.length > MESSAGE_BODY_CHAR_LIMIT;
      const body = truncated ? fullBody.slice(0, MESSAGE_BODY_CHAR_LIMIT) : fullBody;

      const lines = [
        `# ${headers["Subject"] ?? "(no subject)"}`,
        `From: ${headers["From"] ?? ""}`,
        `To: ${headers["To"] ?? ""}`,
        `Date: ${headers["Date"] ?? ""}`,
        `Labels: ${(data.labelIds ?? []).join(", ") || "(none)"}`,
        "",
        body || "(no plain-text body found)",
      ];
      if (truncated) lines.push("", `[truncated — body exceeds ${MESSAGE_BODY_CHAR_LIMIT} characters]`);

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          account: account.label,
          id: data.id,
          thread_id: data.threadId,
          subject: headers["Subject"] ?? "(no subject)",
          from: headers["From"] ?? "",
          to: headers["To"] ?? "",
          date: headers["Date"] ?? "",
          label_ids: data.labelIds ?? [],
          body,
          truncated,
        },
      };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: describeGmailError(error) }] };
    }
  },
};

const getThreadTool: ToolDef = {
  name: "gmail_get_thread",
  title: "Get Gmail Thread",
  description: `Fetch every message in a Gmail conversation thread, in order, with sender/date/plain-text body for each.

Args:
  - account (string, optional)
  - thread_id (string, required): from gmail_search_messages`,
  inputSchema: GetThreadSchema,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args, ctx) => {
    try {
      const input = args as GetThreadInput;
      const { gmail, account } = await getGmailClientForLabel(ctx, input.account);
      const { data } = await gmail.users.threads.get({ userId: "me", id: input.thread_id, format: "full" });
      const messages = (data.messages ?? []).map((m) => {
        const headers = headerMap(m.payload?.headers);
        return {
          id: m.id ?? "",
          from: headers["From"] ?? "",
          date: headers["Date"] ?? "",
          subject: headers["Subject"] ?? "",
          body: extractPlainTextBody(m.payload),
        };
      });

      const lines = [`# Thread — ${account.label} (${account.displayName})`, ""];
      for (const m of messages) {
        lines.push(`## ${m.from} — ${m.date}`);
        lines.push(m.body || "(no plain-text body found)");
        lines.push("");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        structuredContent: {
          account: account.label,
          thread_id: input.thread_id,
          message_count: messages.length,
          messages,
        },
      };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: describeGmailError(error) }] };
    }
  },
};

const listLabelsTool: ToolDef = {
  name: "gmail_list_labels",
  title: "List Gmail Labels",
  description: `List all labels (system + custom) in a Gmail account, with their IDs — needed as input to gmail_modify_labels.

Args:
  - account (string, optional)`,
  inputSchema: ListLabelsSchema,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args, ctx) => {
    try {
      const input = args as ListLabelsInput;
      const { gmail, account } = await getGmailClientForLabel(ctx, input.account);
      const { data } = await gmail.users.labels.list({ userId: "me" });
      const labels = (data.labels ?? []).map((l) => ({
        id: l.id ?? "",
        name: l.name ?? "",
        type: l.type ?? "user",
      }));

      return {
        content: [
          {
            type: "text",
            text: `# Labels — ${account.label} (${account.displayName})\n\n${labels
              .map((l) => `- ${l.name} (${l.id})`)
              .join("\n")}`,
          },
        ],
        structuredContent: { account: account.label, count: labels.length, labels },
      };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: describeGmailError(error) }] };
    }
  },
};

const listDraftsTool: ToolDef = {
  name: "gmail_list_drafts",
  title: "List Gmail Drafts",
  description: `List draft emails saved in a Gmail account. Drafts are never sent by this server — this only lists what already exists.

Args:
  - account (string, optional)
  - max_results (number, 1-25, default 10)`,
  inputSchema: ListDraftsSchema,
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args, ctx) => {
    try {
      const input = args as ListDraftsInput;
      const { gmail, account } = await getGmailClientForLabel(ctx, input.account);
      const { data } = await gmail.users.drafts.list({ userId: "me", maxResults: input.max_results });

      const drafts = await Promise.all(
        (data.drafts ?? []).map(async (d) => {
          const { data: full } = await gmail.users.drafts.get({ userId: "me", id: d.id ?? "", format: "full" });
          const headers = headerMap(full.message?.payload?.headers);
          return {
            draft_id: full.id ?? d.id ?? "",
            message_id: full.message?.id ?? "",
            thread_id: full.message?.threadId ?? "",
            to: headers["To"] ?? "",
            subject: headers["Subject"] ?? "(no subject)",
            snippet: full.message?.snippet ?? "",
          };
        })
      );

      const text = drafts.length
        ? drafts.map((d) => `- [${d.draft_id}] To: ${d.to} — "${d.subject}" — ${d.snippet}`).join("\n")
        : `No drafts in ${account.label} (${account.displayName}).`;

      return {
        content: [{ type: "text", text: `# Drafts — ${account.label} (${account.displayName})\n\n${text}` }],
        structuredContent: { account: account.label, count: drafts.length, drafts },
      };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: describeGmailError(error) }] };
    }
  },
};

const createDraftTool: ToolDef = {
  name: "gmail_create_draft",
  title: "Create Gmail Draft",
  description: `Create a new draft email in a Gmail account. This ONLY saves a draft — it never sends anything. The user reviews and sends it themselves from Gmail.

Args:
  - account (string, optional)
  - to (string, required): recipient(s), comma-separated
  - subject (string)
  - body (string, required): plain text
  - cc (string, optional)
  - thread_id (string, optional): file inside an existing thread
  - in_reply_to_message_id (string, optional): sets reply headers correctly when replying to a specific message

Returns the new draft_id, message_id, and thread_id.`,
  inputSchema: CreateDraftSchema,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
  handler: async (args, ctx) => {
    try {
      const input = args as CreateDraftInput;
      const { gmail, account } = await getGmailClientForLabel(ctx, input.account);

      let inReplyTo: string | undefined;
      let references: string | undefined;
      if (input.in_reply_to_message_id) {
        const { data } = await gmail.users.messages.get({
          userId: "me",
          id: input.in_reply_to_message_id,
          format: "metadata",
          metadataHeaders: ["Message-Id", "References"],
        });
        const headers = headerMap(data.payload?.headers);
        inReplyTo = headers["Message-Id"];
        references = headers["References"] ? `${headers["References"]} ${inReplyTo}` : inReplyTo;
      }

      const raw = buildRawMessage({
        to: input.to,
        cc: input.cc,
        subject: input.subject ?? "",
        body: input.body,
        inReplyTo,
        references,
      });

      const { data } = await gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw, threadId: input.thread_id } },
      });

      return {
        content: [
          {
            type: "text",
            text:
              `Draft created in ${account.label} (${account.displayName}): "${input.subject}" to ${input.to}. ` +
              `Draft id: ${data.id}. It has NOT been sent — review and send it from Gmail.`,
          },
        ],
        structuredContent: {
          account: account.label,
          draft_id: data.id,
          message_id: data.message?.id,
          thread_id: data.message?.threadId,
          to: input.to,
          subject: input.subject,
        },
      };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: describeGmailError(error) }] };
    }
  },
};

const updateDraftTool: ToolDef = {
  name: "gmail_update_draft",
  title: "Update Gmail Draft",
  description: `Update an existing Gmail draft's recipient, subject, cc, or body. Only provided fields change; omitted fields keep their current value. Never sends anything.

Args:
  - account (string, optional)
  - draft_id (string, required): from gmail_list_drafts
  - to, subject, body, cc (all optional)`,
  inputSchema: UpdateDraftSchema,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args, ctx) => {
    try {
      const input = args as UpdateDraftInput;
      const { gmail, account } = await getGmailClientForLabel(ctx, input.account);
      const { data: existing } = await gmail.users.drafts.get({ userId: "me", id: input.draft_id, format: "full" });
      const headers = headerMap(existing.message?.payload?.headers);

      const to = input.to ?? headers["To"] ?? "";
      const subject = input.subject ?? headers["Subject"] ?? "";
      const cc = input.cc ?? headers["Cc"] ?? undefined;
      const body = input.body ?? extractPlainTextBody(existing.message?.payload);

      const raw = buildRawMessage({ to, subject, body, cc });
      const { data } = await gmail.users.drafts.update({
        userId: "me",
        id: input.draft_id,
        requestBody: { message: { raw, threadId: existing.message?.threadId ?? undefined } },
      });

      return {
        content: [
          { type: "text", text: `Updated draft ${data.id} in ${account.label}: "${subject}" to ${to}. Still not sent.` },
        ],
        structuredContent: { account: account.label, draft_id: data.id, to, subject },
      };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: describeGmailError(error) }] };
    }
  },
};

const modifyLabelsTool: ToolDef = {
  name: "gmail_modify_labels",
  title: "Add/Remove Gmail Labels",
  description: `Add or remove labels on a single Gmail message — e.g. archive (remove "INBOX"), mark read (remove "UNREAD"), star (add "STARRED"), or apply a custom label from gmail_list_labels.

Args:
  - account (string, optional)
  - message_id (string, required)
  - add_labels (string[], default [])
  - remove_labels (string[], default [])

Common system label IDs: INBOX, UNREAD, STARRED, IMPORTANT, SPAM, TRASH, SENT, DRAFT.`,
  inputSchema: ModifyLabelsSchema,
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  handler: async (args, ctx) => {
    try {
      const input = args as ModifyLabelsInput;
      const { gmail, account } = await getGmailClientForLabel(ctx, input.account);
      const { data } = await gmail.users.messages.modify({
        userId: "me",
        id: input.message_id,
        requestBody: { addLabelIds: input.add_labels, removeLabelIds: input.remove_labels },
      });

      return {
        content: [
          {
            type: "text",
            text: `Updated labels on message ${input.message_id} in ${account.label}. Now: ${(data.labelIds ?? []).join(", ")}`,
          },
        ],
        structuredContent: { account: account.label, message_id: input.message_id, label_ids: data.labelIds ?? [] },
      };
    } catch (error) {
      return { isError: true, content: [{ type: "text", text: describeGmailError(error) }] };
    }
  },
};

export const gmailTools: ToolDef[] = [
  searchMessagesTool,
  getMessageTool,
  getThreadTool,
  listLabelsTool,
  listDraftsTool,
  createDraftTool,
  updateDraftTool,
  modifyLabelsTool,
];
