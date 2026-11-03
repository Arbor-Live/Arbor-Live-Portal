import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { buildThreadReferences } from "./lib/bookingEmail";
import { MAX_BODY_CHARS, normalizeMessageId } from "./lib/inboundEmail";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

/** Resend assigns the Message-ID some seconds after the send returns. */
const MESSAGE_ID_RETRY_DELAYS_MS = [10_000, 60_000, 5 * 60_000];

/** Enough rows to hold `MAX_REFERENCES` ids even when some messages have no id yet. */
const HEADER_SCAN_LIMIT = 60;

/**
 * The `In-Reply-To` / `References` ids for the next message on a thread: every
 * stored message, inbound and outbound, in order. Messages whose id Resend has
 * not assigned yet are skipped.
 */
export const getThreadHeaders = internalQuery({
  args: { threadId: v.id("emailThreads") },
  returns: v.object({
    inReplyTo: v.optional(v.string()),
    references: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const newest = await ctx.db
      .query("emailMessages")
      .withIndex("by_threadId_and_receivedAt", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(HEADER_SCAN_LIMIT);
    const ids = newest.reverse().flatMap((message) => message.messageId ?? []);
    return buildThreadReferences(ids);
  },
});

/**
 * Record an email we sent on its booking thread so the portal shows the whole
 * conversation. Never notifies staff: they sent it.
 */
export const recordOutboundEmail = internalMutation({
  args: {
    threadId: v.id("emailThreads"),
    resendEmailId: v.string(),
    /** Known up front only when Resend is mocked; otherwise captured after the send. */
    messageId: v.optional(v.string()),
    fromEmail: v.string(),
    fromName: v.optional(v.string()),
    to: v.array(v.string()),
    cc: v.array(v.string()),
    subject: v.string(),
    bodyText: v.string(),
    attachments: v.array(v.object({ filename: v.string(), contentType: v.optional(v.string()) })),
    inReplyTo: v.optional(v.string()),
    references: v.array(v.string()),
    sentAt: v.number(),
  },
  returns: v.union(v.literal("duplicate"), v.literal("recorded")),
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query("emailMessages")
      .withIndex("by_resendEmailId", (q) => q.eq("resendEmailId", args.resendEmailId))
      .first();
    if (duplicate) return "duplicate";
    const thread = await ctx.db.get(args.threadId);
    if (!thread) return "duplicate";

    const messageRowId = await ctx.db.insert("emailMessages", {
      threadId: args.threadId,
      direction: "outbound",
      resendEmailId: args.resendEmailId,
      messageId: args.messageId,
      inReplyTo: args.inReplyTo,
      references: args.references,
      fromEmail: args.fromEmail,
      fromName: args.fromName,
      to: args.to,
      cc: args.cc,
      subject: args.subject,
      bodyText: args.bodyText.slice(0, MAX_BODY_CHARS),
      attachments: args.attachments,
      receivedAt: args.sentAt,
    });
    await ctx.db.patch(args.threadId, {
      lastMessageAt:
        thread.messageCount === 0 ? args.sentAt : Math.max(thread.lastMessageAt, args.sentAt),
      messageCount: thread.messageCount + 1,
    });
    if (!args.messageId) {
      await ctx.scheduler.runAfter(
        MESSAGE_ID_RETRY_DELAYS_MS[0]!,
        internal.emailOutbound.captureMessageId,
        { messageRowId, attempt: 0 },
      );
    }
    return "recorded";
  },
});

export const getOutboundMessage = internalQuery({
  args: { messageRowId: v.id("emailMessages") },
  returns: v.union(
    v.object({ resendEmailId: v.string(), hasMessageId: v.boolean() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row: Doc<"emailMessages"> | null = await ctx.db.get(args.messageRowId);
    if (!row) return null;
    return { resendEmailId: row.resendEmailId, hasMessageId: Boolean(row.messageId) };
  },
});

export const setOutboundMessageId = internalMutation({
  args: { messageRowId: v.id("emailMessages"), messageId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.messageRowId);
    if (!row || row.messageId) return null;
    await ctx.db.patch(args.messageRowId, { messageId: args.messageId });
    return null;
  },
});

/**
 * Read the Message-ID Resend gave a sent email (`GET /emails/{id}` →
 * `message_id`) so replies that quote it match the thread by header. Resend
 * fills it in a few seconds after the send, so a missing id retries on a
 * backoff before giving up.
 */
export const captureMessageId = internalAction({
  args: { messageRowId: v.id("emailMessages"), attempt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

    const row = await ctx.runQuery(internal.emailOutbound.getOutboundMessage, {
      messageRowId: args.messageRowId,
    });
    if (!row || row.hasMessageId) return null;

    let messageId: string | undefined;
    let failure = "no message_id yet";
    try {
      const response = await fetch(`${RESEND_EMAILS_URL}/${encodeURIComponent(row.resendEmailId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (response.ok) {
        const body: unknown = await response.json();
        const raw =
          typeof body === "object" && body !== null && "message_id" in body
            ? (body as { message_id: unknown }).message_id
            : undefined;
        messageId = typeof raw === "string" ? normalizeMessageId(raw) : undefined;
      } else {
        failure = `HTTP ${response.status}`;
      }
    } catch (error) {
      failure = `network error: ${String(error)}`;
    }

    if (messageId) {
      await ctx.runMutation(internal.emailOutbound.setOutboundMessageId, {
        messageRowId: args.messageRowId,
        messageId,
      });
      return null;
    }

    const delay = MESSAGE_ID_RETRY_DELAYS_MS[args.attempt + 1];
    if (delay === undefined) {
      console.error(
        `Resend message id for ${row.resendEmailId} not available after ${args.attempt + 1} attempts: ${failure}`,
      );
      return null;
    }
    await ctx.scheduler.runAfter(delay, internal.emailOutbound.captureMessageId, {
      messageRowId: args.messageRowId,
      attempt: args.attempt + 1,
    });
    return null;
  },
});
