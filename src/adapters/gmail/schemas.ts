import { z } from "zod";

export const accountField = z
  .string()
  .min(1)
  .describe(
    'Which configured Gmail account to use, identified by its label (e.g. "work", "personal"). ' +
      "Required when more than one Gmail account is configured; optional when there's only one. " +
      "Call vault_list_accounts first if you're not sure what's configured."
  )
  .optional();

export const SearchMessagesSchema = z
  .object({
    account: accountField,
    query: z
      .string()
      .min(1)
      .max(500)
      .describe(
        'Gmail search syntax, e.g. "from:boss@company.com is:unread", "subject:invoice after:2026/07/01".'
      ),
    max_results: z.number().int().min(1).max(25).default(10).describe("Maximum messages to return (1-25)."),
  })
  .strict();
export type SearchMessagesInput = z.infer<typeof SearchMessagesSchema>;

export const GetMessageSchema = z
  .object({
    account: accountField,
    message_id: z.string().min(1).describe("Gmail message id, from a prior gmail_search_messages result."),
  })
  .strict();
export type GetMessageInput = z.infer<typeof GetMessageSchema>;

export const GetThreadSchema = z
  .object({
    account: accountField,
    thread_id: z.string().min(1).describe("Gmail thread id, from a prior gmail_search_messages result."),
  })
  .strict();
export type GetThreadInput = z.infer<typeof GetThreadSchema>;

export const ListLabelsSchema = z
  .object({
    account: accountField,
  })
  .strict();
export type ListLabelsInput = z.infer<typeof ListLabelsSchema>;

export const ListDraftsSchema = z
  .object({
    account: accountField,
    max_results: z.number().int().min(1).max(25).default(10),
  })
  .strict();
export type ListDraftsInput = z.infer<typeof ListDraftsSchema>;

export const CreateDraftSchema = z
  .object({
    account: accountField,
    to: z.string().min(3).describe("Recipient email address(es), comma-separated."),
    subject: z.string().default(""),
    body: z.string().describe("Plain-text body."),
    cc: z.string().optional(),
    thread_id: z.string().optional().describe("Set to file the draft inside an existing thread."),
    in_reply_to_message_id: z
      .string()
      .optional()
      .describe("Gmail message id being replied to — sets In-Reply-To/References headers correctly."),
  })
  .strict();
export type CreateDraftInput = z.infer<typeof CreateDraftSchema>;

export const UpdateDraftSchema = z
  .object({
    account: accountField,
    draft_id: z.string().min(1).describe("Draft id, from gmail_list_drafts."),
    to: z.string().min(3).optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
    cc: z.string().optional(),
  })
  .strict();
export type UpdateDraftInput = z.infer<typeof UpdateDraftSchema>;

export const ModifyLabelsSchema = z
  .object({
    account: accountField,
    message_id: z.string().min(1),
    add_labels: z
      .array(z.string())
      .default([])
      .describe('Label IDs to add, e.g. ["STARRED"] or a custom label id from gmail_list_labels.'),
    remove_labels: z.array(z.string()).default([]).describe('Label IDs to remove, e.g. ["UNREAD", "INBOX"].'),
  })
  .strict();
export type ModifyLabelsInput = z.infer<typeof ModifyLabelsSchema>;
