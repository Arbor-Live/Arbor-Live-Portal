import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  internalAction,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import { bookingRequestsAdminUrl, eventDashboardUrl, invoiceDashboardUrl } from "./email/constants";
import { findAuthUsersByIds, listAdminUsersForVertical } from "./lib/auth";
import type { BookingTarget } from "./lib/bookingChain";
import { listBookingFollowers } from "./lib/bookingFollowers";
import { parseBookingAddress } from "./lib/emailAddresses";
import {
  type BookingRef,
  getOrCreateThreadForBooking,
} from "./lib/emailThreads";
import { recordBookingEmailNotification } from "./lib/inAppNotifications";
import {
  MAX_BODY_CHARS,
  MAX_FULL_TEXT_CHARS,
  parseReceivedEmail,
  parsedInboundEmailValue,
} from "./lib/inboundEmail";
import { stripQuotedReply } from "./lib/stripQuotedReply";

const RESEND_RECEIVING_URL = "https://api.resend.com/emails/receiving";

/** Resend rate-limits and occasionally 5xxs; a lost reply is worse than a late one. */
const FETCH_RETRY_DELAYS_MS = [30_000, 5 * 60_000];

export const processInboundEmail = internalAction({
  args: { resendEmailId: v.string(), attempt: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured");

    const attempt = args.attempt ?? 0;
    let response: Response;
    try {
      response = await fetch(`${RESEND_RECEIVING_URL}/${encodeURIComponent(args.resendEmailId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
    } catch (error) {
      await retryOrThrow(ctx, args.resendEmailId, attempt, `network error: ${String(error)}`);
      return null;
    }
    if (response.status === 429 || response.status >= 500) {
      await retryOrThrow(ctx, args.resendEmailId, attempt, `HTTP ${response.status}`);
      return null;
    }
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      throw new Error(
        `Resend receiving fetch for ${args.resendEmailId} failed: HTTP ${response.status} ${detail}`,
      );
    }

    const parsed = parseReceivedEmail(await response.json(), args.resendEmailId);
    const outcome: "duplicate" | "matched" | "unmatched" = await ctx.runMutation(
      internal.emailInbound.recordInboundEmail,
      parsed,
    );
    console.log(`Inbound email ${args.resendEmailId}: ${outcome}`);
    return null;
  },
});

async function retryOrThrow(
  ctx: ActionCtx,
  resendEmailId: string,
  attempt: number,
  reason: string,
) {
  const delay = FETCH_RETRY_DELAYS_MS[attempt];
  if (delay === undefined) {
    throw new Error(
      `Resend receiving fetch for ${resendEmailId} failed after ${attempt + 1} attempts: ${reason}`,
    );
  }
  await ctx.scheduler.runAfter(delay, internal.emailInbound.processInboundEmail, {
    resendEmailId,
    attempt: attempt + 1,
  });
}

/**
 * New invoice numbers are uppercase, but older ones carry a mixed-case suffix
 * (`ALINV-PwWqpa9`) that a lowercased email address can't spell back. The
 * search index ignores case, so it finds those.
 */
async function findInvoiceByNumberIgnoringCase(ctx: MutationCtx, number: string) {
  const exact = await ctx.db
    .query("invoices")
    .withIndex("by_invoiceNumber", (q) => q.eq("invoiceNumber", number))
    .first();
  if (exact) return exact;
  const wanted = number.toLowerCase();
  const candidates = await ctx.db
    .query("invoices")
    .withSearchIndex("search_invoiceNumber", (q) => q.search("invoiceNumber", wanted))
    .take(10);
  return candidates.find((invoice) => invoice.invoiceNumber.toLowerCase() === wanted) ?? null;
}

/** The first To/CC/envelope address naming a booking that exists. */
async function matchByAddress(
  ctx: MutationCtx,
  addresses: string[],
): Promise<BookingRef | null> {
  for (const address of addresses) {
    const parsed = parseBookingAddress(address);
    if (!parsed) continue;
    if (parsed.kind === "request") {
      const request = await ctx.db
        .query("eventRequests")
        .withIndex("by_requestNumber", (q) => q.eq("requestNumber", parsed.number))
        .first();
      if (request) return { requestId: request._id };
    } else if (parsed.kind === "invoice") {
      const invoice = await findInvoiceByNumberIgnoringCase(ctx, parsed.number);
      if (invoice) return { invoiceId: invoice._id };
    } else {
      const eventId = ctx.db.normalizeId("events", parsed.id);
      if (eventId && (await ctx.db.get(eventId))) return { eventId };
    }
  }
  return null;
}

/** The thread of the nearest earlier message this one replies to. */
async function matchByHeader(
  ctx: MutationCtx,
  email: { inReplyTo?: string; references: string[] },
): Promise<Id<"emailThreads"> | null> {
  const candidates = [email.inReplyTo, ...[...email.references].reverse()];
  const seen = new Set<string>();
  for (const messageId of candidates) {
    if (!messageId || seen.has(messageId)) continue;
    seen.add(messageId);
    const hits = await ctx.db
      .query("emailMessages")
      .withIndex("by_messageId", (q) => q.eq("messageId", messageId))
      .take(5);
    const matched = hits.find((hit) => hit.threadId);
    if (matched?.threadId) return matched.threadId;
  }
  return null;
}

async function notifyBookingStaff(
  ctx: MutationCtx,
  thread: Doc<"emailThreads">,
  message: { resendEmailId: string; fromEmail: string; fromName?: string; bodyText: string },
) {
  const [request, invoice, event] = await Promise.all([
    thread.requestId ? ctx.db.get(thread.requestId) : null,
    thread.invoiceId ? ctx.db.get(thread.invoiceId) : null,
    thread.eventId ? ctx.db.get(thread.eventId) : null,
  ]);
  const userIds = new Set<string>();
  for (const userId of [invoice?.managerUserId, request?.assigneeUserId, event?.eventManagerUserId]) {
    if (userId) userIds.add(userId);
  }

  const url = thread.requestId
    ? bookingRequestsAdminUrl(thread.requestId)
    : thread.invoiceId
      ? invoiceDashboardUrl(thread.invoiceId)
      : thread.eventId
        ? eventDashboardUrl(thread.eventId)
        : null;
  if (!url) return;

  const staffById = await findAuthUsersByIds(ctx, [...userIds]);
  let recipients: { userId: string; email?: string | null }[] = [...userIds].flatMap((userId) => {
    const staff = staffById.get(userId);
    return staff ? [{ userId, email: staff.email }] : [];
  });
  // Nobody owns the booking yet: the Crew admins who triage new requests hear about it instead.
  if (recipients.length === 0) recipients = await listAdminUsersForVertical(ctx, "Crew");

  const targets: BookingTarget[] = [];
  if (thread.requestId) targets.push({ kind: "request", requestId: thread.requestId });
  if (thread.invoiceId) targets.push({ kind: "invoice", invoiceId: thread.invoiceId });
  if (thread.eventId) targets.push({ kind: "event", eventId: thread.eventId });
  const followers = await listBookingFollowers(ctx, targets, {
    userIds: recipients.map((recipient) => recipient.userId),
    emails: recipients.flatMap((recipient) => (recipient.email ? [recipient.email] : [])),
  });
  recipients = [
    ...recipients,
    ...followers.flatMap((follower) =>
      follower.userId ? [{ userId: follower.userId, email: follower.email }] : [],
    ),
  ];

  const sender = message.fromEmail.toLowerCase();
  for (const recipient of recipients) {
    // A manager CC'ing the booking address on their own mail is not news to them.
    if (recipient.email?.toLowerCase() === sender) continue;
    await recordBookingEmailNotification(ctx, {
      userId: recipient.userId,
      resendEmailId: message.resendEmailId,
      title: `Reply from ${message.fromName ?? message.fromEmail}`,
      body: message.bodyText,
      url,
      eventId: thread.eventId,
    });
  }
}

/**
 * Store one received email on its booking's thread. Takes the parsed shape (not
 * a Resend id) so `npx convex run emailInbound:recordInboundEmail` can inject a
 * sample without calling Resend.
 */
export const recordInboundEmail = internalMutation({
  args: parsedInboundEmailValue,
  returns: v.union(v.literal("duplicate"), v.literal("matched"), v.literal("unmatched")),
  handler: async (ctx, args) => {
    const duplicate = await ctx.db
      .query("emailMessages")
      .withIndex("by_resendEmailId", (q) => q.eq("resendEmailId", args.resendEmailId))
      .first();
    if (duplicate) return "duplicate";

    let thread: Doc<"emailThreads"> | null = null;
    let matchedBy: "address" | "header" | undefined;

    const bookingRef = await matchByAddress(ctx, [...args.to, ...args.cc, ...args.receivedFor]);
    if (bookingRef) {
      thread = await getOrCreateThreadForBooking(ctx, bookingRef);
      matchedBy = "address";
    } else {
      const threadId = await matchByHeader(ctx, args);
      if (threadId) {
        thread = await ctx.db.get(threadId);
        matchedBy = thread ? "header" : undefined;
      }
    }

    const bodyText = stripQuotedReply(args.text).slice(0, MAX_BODY_CHARS);
    await ctx.db.insert("emailMessages", {
      threadId: thread?._id,
      direction: "inbound",
      resendEmailId: args.resendEmailId,
      messageId: args.messageId,
      inReplyTo: args.inReplyTo,
      references: args.references,
      fromEmail: args.fromEmail,
      fromName: args.fromName,
      to: args.to,
      cc: args.cc,
      subject: args.subject,
      bodyText,
      fullText: args.text.slice(0, MAX_FULL_TEXT_CHARS),
      attachments: args.attachments,
      matchedBy,
      receivedAt: args.receivedAt,
    });
    if (!thread) return "unmatched";

    await ctx.db.patch(thread._id, {
      lastMessageAt:
        thread.messageCount === 0
          ? args.receivedAt
          : Math.max(thread.lastMessageAt, args.receivedAt),
      messageCount: thread.messageCount + 1,
    });
    await notifyBookingStaff(ctx, thread, {
      resendEmailId: args.resendEmailId,
      fromEmail: args.fromEmail,
      fromName: args.fromName,
      bodyText,
    });
    return "matched";
  },
});
