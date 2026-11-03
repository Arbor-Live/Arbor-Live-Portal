import type { EmailId } from "@convex-dev/resend";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import { resendClient } from "./email/resendClient";
import { buildThreadReferences } from "./lib/bookingEmail";
import { MAX_BODY_CHARS, normalizeMessageId } from "./lib/inboundEmail";

const RESEND_EMAILS_URL = "https://api.resend.com/emails";

/**
 * Resend assigns the Message-ID a few seconds after it accepts an email. A
 * component send can also wait in its queue: up to 5 attempts at 30s, 60s,
 * 120s, 240s backoff (~8 min). The later delays (31 min in total) cover both.
 */
export const MESSAGE_ID_RETRY_DELAYS_MS = [10_000, 60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000];

/** Rows read from each end of the thread; enough to find ids when some messages have none yet. */
const HEADER_SCAN_LIMIT = 30;

/**
 * The `In-Reply-To` / `References` ids for the next message on a thread: the
 * first message with an id, then the newest ones, inbound and outbound.
 * Messages whose id Resend has not assigned yet are skipped.
 */
export const getThreadHeaders = internalQuery({
  args: { threadId: v.id("emailThreads") },
  returns: v.object({
    inReplyTo: v.optional(v.string()),
    references: v.array(v.string()),
  }),
  handler: async (ctx, args) => {
    const oldest = await ctx.db
      .query("emailMessages")
      .withIndex("by_threadId_and_receivedAt", (q) => q.eq("threadId", args.threadId))
      .take(HEADER_SCAN_LIMIT);
    const newest = await ctx.db
      .query("emailMessages")
      .withIndex("by_threadId_and_receivedAt", (q) => q.eq("threadId", args.threadId))
      .order("desc")
      .take(HEADER_SCAN_LIMIT);
    return buildThreadReferences({
      root: oldest.find((message) => message.messageId)?.messageId,
      recent: newest.reverse().flatMap((message) => message.messageId ?? []),
    });
  },
});

const outboundMessageValue = v.object({
  threadId: v.id("emailThreads"),
  /** Resend's id, or the component's until the capture resolves it. */
  resendEmailId: v.string(),
  /** Set for a component send: the capture first asks the component for Resend's id. */
  componentEmailId: v.optional(v.string()),
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
});

type OutboundMessage = typeof outboundMessageValue.type;

/**
 * Store an email we sent on its booking thread so the portal shows the whole
 * conversation. Never notifies staff: they sent it.
 */
async function recordOutboundEmail(
  ctx: MutationCtx,
  message: OutboundMessage,
): Promise<"recorded" | "duplicate" | "thread_missing"> {
  const duplicate = await ctx.db
    .query("emailMessages")
    .withIndex("by_resendEmailId", (q) => q.eq("resendEmailId", message.resendEmailId))
    .first();
  if (duplicate) return "duplicate";
  const thread = await ctx.db.get(message.threadId);
  if (!thread) return "thread_missing";

  const messageRowId = await ctx.db.insert("emailMessages", {
    threadId: message.threadId,
    direction: "outbound",
    resendEmailId: message.resendEmailId,
    messageId: message.messageId,
    inReplyTo: message.inReplyTo,
    references: message.references,
    fromEmail: message.fromEmail,
    fromName: message.fromName,
    to: message.to,
    cc: message.cc,
    subject: message.subject,
    bodyText: message.bodyText.slice(0, MAX_BODY_CHARS),
    attachments: message.attachments,
    receivedAt: message.sentAt,
  });
  await ctx.db.patch(message.threadId, {
    lastMessageAt:
      thread.messageCount === 0 ? message.sentAt : Math.max(thread.lastMessageAt, message.sentAt),
    messageCount: thread.messageCount + 1,
  });
  if (!message.messageId) {
    await ctx.scheduler.runAfter(
      MESSAGE_ID_RETRY_DELAYS_MS[0]!,
      internal.emailOutbound.captureMessageId,
      { messageRowId, attempt: 0, componentEmailId: message.componentEmailId },
    );
  }
  return "recorded";
}

/**
 * A booking email went out: mark its notification sent and record it on the
 * thread in one transaction, so a sent email is never missing from the portal.
 * `thread_missing` (the thread was deleted) still marks the email sent.
 */
export const markBookingEmailSent = internalMutation({
  args: {
    notificationId: v.id("emailNotifications"),
    resendId: v.string(),
    message: outboundMessageValue,
  },
  returns: v.union(v.literal("recorded"), v.literal("duplicate"), v.literal("thread_missing")),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.notificationId, {
      status: "sent",
      resendId: args.resendId,
      sentAt: Date.now(),
    });
    return await recordOutboundEmail(ctx, args.message);
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

export const setOutboundIds = internalMutation({
  args: {
    messageRowId: v.id("emailMessages"),
    resendEmailId: v.optional(v.string()),
    messageId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.messageRowId);
    if (!row || row.messageId) return null;
    await ctx.db.patch(args.messageRowId, {
      ...(args.resendEmailId ? { resendEmailId: args.resendEmailId } : {}),
      ...(args.messageId ? { messageId: args.messageId } : {}),
    });
    return null;
  },
});

/** Resend's id for a component send; `pending` while the component hasn't sent it yet. */
async function resolveComponentResendId(
  ctx: Parameters<typeof resendClient.get>[0],
  componentEmailId: string,
): Promise<{ resendId: string } | { pending: string } | { gone: string }> {
  const email = await resendClient.get(ctx, componentEmailId as EmailId);
  if (email?.resendId) return { resendId: email.resendId };
  if (!email) return { gone: "not found in the Resend component" };
  if (email.status === "failed" || email.status === "cancelled") {
    return { gone: `${email.status} in the Resend component: ${email.errorMessage ?? "no error"}` };
  }
  return { pending: `component email still ${email.status}` };
}

async function fetchResendMessageId(
  apiKey: string,
  resendEmailId: string,
): Promise<{ messageId: string } | { failure: string }> {
  try {
    const response = await fetch(`${RESEND_EMAILS_URL}/${encodeURIComponent(resendEmailId)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) return { failure: `HTTP ${response.status}` };
    const body: unknown = await response.json();
    const raw =
      typeof body === "object" && body !== null && "message_id" in body
        ? (body as { message_id: unknown }).message_id
        : undefined;
    const messageId = typeof raw === "string" ? normalizeMessageId(raw) : undefined;
    return messageId ? { messageId } : { failure: "no message_id yet" };
  } catch (error) {
    return { failure: `network error: ${String(error)}` };
  }
}

/**
 * Read the Message-ID Resend gave a sent email so replies that quote it match
 * the thread by header. A component send first resolves Resend's id from the
 * component, then `GET /emails/{id}` gives `message_id`. Either can lag the
 * send, so a miss retries on a backoff before giving up.
 */
export const captureMessageId = internalAction({
  args: {
    messageRowId: v.id("emailMessages"),
    attempt: v.number(),
    componentEmailId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

    const row = await ctx.runQuery(internal.emailOutbound.getOutboundMessage, {
      messageRowId: args.messageRowId,
    });
    if (!row || row.hasMessageId) return null;

    let resendEmailId: string | null = row.resendEmailId;
    let failure = "no message_id yet";
    if (args.componentEmailId && row.resendEmailId === args.componentEmailId) {
      const resolved = await resolveComponentResendId(ctx, args.componentEmailId);
      if ("gone" in resolved) {
        console.error(`Booking email ${args.componentEmailId} has no Message-ID: ${resolved.gone}`);
        return null;
      }
      if ("pending" in resolved) {
        resendEmailId = null;
        failure = resolved.pending;
      } else {
        resendEmailId = resolved.resendId;
        await ctx.runMutation(internal.emailOutbound.setOutboundIds, {
          messageRowId: args.messageRowId,
          resendEmailId,
        });
      }
    }

    if (resendEmailId) {
      const fetched = await fetchResendMessageId(apiKey, resendEmailId);
      if ("messageId" in fetched) {
        await ctx.runMutation(internal.emailOutbound.setOutboundIds, {
          messageRowId: args.messageRowId,
          messageId: fetched.messageId,
        });
        return null;
      }
      failure = fetched.failure;
    }

    const delay = MESSAGE_ID_RETRY_DELAYS_MS[args.attempt + 1];
    if (delay === undefined) {
      console.error(
        `Resend message id for ${resendEmailId ?? args.componentEmailId} not available after ${args.attempt + 1} attempts: ${failure}`,
      );
      return null;
    }
    await ctx.scheduler.runAfter(delay, internal.emailOutbound.captureMessageId, {
      messageRowId: args.messageRowId,
      attempt: args.attempt + 1,
      componentEmailId: args.componentEmailId,
    });
    return null;
  },
});
