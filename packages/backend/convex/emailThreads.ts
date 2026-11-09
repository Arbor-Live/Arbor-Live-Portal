import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, type MutationCtx, query, type QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  getUserId,
  hasOperationsAccess,
  requireAdminOrOperations,
  requireArborInternalContext,
  requireAuth,
} from "./lib/auth";
import { appError } from "./lib/errors";
import { previewBookingEmail, resolveSenderName, sendAsValidator } from "./lib/bookingEmail";
import { bookingAddressFor, normalizePlainAddress } from "./lib/emailAddresses";
import { requestInvoiceQuoteChanges } from "./lib/publicQuoteView";
import { resolvePortalTokenForInvoice } from "./lib/paymentProof";
import { isRequestPublicTokenExpired } from "./lib/requestToken";
import {
  bookingRefFromArgs,
  changeRequestBlocker,
  clientReplyAddress,
  findThreadForBooking,
  getOrCreateThreadForBooking,
  hasAttachableQuote,
  loadBookingParties,
  MAX_CHANGE_NOTE_CHARS,
  resolveBookingRefs,
  threadBookingRef,
  truncateOnWord,
} from "./lib/emailThreads";
import { publicQuoteUrl, requestTrackingUrl } from "./email/constants";
import { enqueueEmail } from "./email/enqueue";
import { attachmentSourceKey } from "./lib/emailAttachments";
import { MAX_ATTACHMENTS } from "./lib/inboundEmail";

/** Newest messages shown on a booking. A thread past this is a long negotiation, not normal traffic. */
const MESSAGE_LIMIT = 100;

/** A reply is a few paragraphs; the cap stops a paste of a whole document. */
export const MAX_REPLY_CHARS = 10_000;
/** A manager copies a colleague or two; ten is a mailing list. */
export const MAX_REPLY_CC = 10;
const MAX_CLIENT_REQUEST_ID_CHARS = 100;

/** Failed replies shown on a thread; staff retry or resend them, so a pile of them is not normal. */
const FAILED_REPLY_LIMIT = 20;
/** Enough of a failed reply to recognise it; the full text is in the queued payload. */
const FAILED_REPLY_PREVIEW_CHARS = 500;

function replyBody(payload: unknown) {
  const body = (payload as { body?: unknown } | null)?.body;
  return typeof body === "string" ? body : "";
}

const messageValue = v.object({
  _id: v.id("emailMessages"),
  direction: v.union(v.literal("inbound"), v.literal("outbound")),
  fromEmail: v.string(),
  fromName: v.optional(v.string()),
  /** Recipients of an email we sent; inbound mail always went to the booking address. */
  to: v.optional(v.array(v.string())),
  subject: v.string(),
  bodyText: v.string(),
  attachments: v.array(v.object({ filename: v.string(), inEventFiles: v.boolean() })),
  matchedBy: v.optional(v.union(v.literal("address"), v.literal("header"))),
  /** Sent by the booking's client (request or invoice contact) rather than by staff or a third party. */
  fromClient: v.boolean(),
  receivedAt: v.number(),
  changeRequestedAt: v.optional(v.number()),
  /** Staff may turn this message into the quote change request (server-checked again on click). */
  canMakeChangeRequest: v.boolean(),
});

const failedReplyValue = v.object({
  _id: v.id("emailNotifications"),
  to: v.string(),
  cc: v.array(v.string()),
  /** Start of what staff wrote. */
  bodyPreview: v.string(),
  error: v.string(),
  createdAt: v.number(),
});

/** The link a reply carries so the client can open their booking, or null when none is live. */
async function replyPortalLink(
  ctx: QueryCtx | MutationCtx,
  request: Doc<"eventRequests"> | null,
  invoice: Doc<"invoices"> | null,
) {
  const tracker = (token: string) => ({
    url: requestTrackingUrl(token),
    label: "Open your request tracker",
  });
  const portal = invoice ? await resolvePortalTokenForInvoice(ctx, invoice) : null;
  if (portal?.portal === "request") return tracker(portal.token);
  // A void or expired quote link opens a dead page, so it is never sent.
  const quoteDead =
    invoice?.status === "void" ||
    (invoice?.publicApprovalTokenExpiresAt !== undefined &&
      invoice.publicApprovalTokenExpiresAt < Date.now());
  if (portal && !quoteDead) {
    return { url: publicQuoteUrl(portal.token), label: "Open your quote" };
  }
  if (request?.publicToken && !isRequestPublicTokenExpired(request)) {
    return tracker(request.publicToken);
  }
  return null;
}

const bookingRecordArgs = {
  requestId: v.optional(v.id("eventRequests")),
  invoiceId: v.optional(v.id("invoices")),
  eventId: v.optional(v.id("events")),
};

/**
 * The booking conversation for a request, invoice or event page. A request, its
 * invoice and its event all resolve to the same thread. Read-only: the thread is
 * created by the first email on the booking, inbound or outbound, never by
 * looking at the page.
 */
export const getForRecord = query({
  args: bookingRecordArgs,
  returns: v.object({
    address: v.union(v.string(), v.null()),
    /** Where a reply goes: the request's contact, else the invoice's. */
    clientEmail: v.union(v.string(), v.null()),
    /** The booking has a quote (not void) that a reply can attach as a PDF. */
    canAttachQuote: v.boolean(),
    /** The viewer may email the client and make change requests (admins and Operations). */
    canReply: v.boolean(),
    thread: v.union(v.object({ id: v.id("emailThreads"), messageCount: v.number() }), v.null()),
    messages: v.array(messageValue),
    /** Replies that never went out, oldest first. */
    failedReplies: v.array(failedReplyValue),
  }),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const canReply = await hasOperationsAccess(ctx, user);

    const refs = await resolveBookingRefs(ctx, bookingRefFromArgs(args));
    const thread = await findThreadForBooking(ctx, refs);
    const { request, invoice, clientEmails } = await loadBookingParties(ctx, refs, thread);
    // Every page of a booking shows its shortest address; the others still route.
    const address =
      (request ? bookingAddressFor({ kind: "request", requestNumber: request.requestNumber }) : null) ??
      (invoice ? bookingAddressFor({ kind: "invoice", invoiceNumber: invoice.invoiceNumber }) : null) ??
      (refs.eventId ? bookingAddressFor({ kind: "event", id: refs.eventId }) : null);

    const clientEmail = clientReplyAddress(request, invoice);
    const canAttachQuote = hasAttachableQuote(invoice);

    if (!thread) {
      return { address, clientEmail, canAttachQuote, canReply, thread: null, messages: [], failedReplies: [] };
    }

    const failed = await ctx.db
      .query("emailNotifications")
      .withIndex("by_booking_threadId_and_status", (q) =>
        q.eq("booking.threadId", thread._id).eq("status", "failed"),
      )
      .order("desc")
      .take(FAILED_REPLY_LIMIT);

    const newest = await ctx.db
      .query("emailMessages")
      .withIndex("by_threadId_and_receivedAt", (q) => q.eq("threadId", thread._id))
      .order("desc")
      .take(MESSAGE_LIMIT);

    // Only an event page can copy files to its event, so only it asks which already were.
    const copied = new Set<string>();
    const eventId = args.eventId;
    if (eventId) {
      for (const message of newest) {
        if (message.attachments.length === 0) continue;
        const artifacts = await ctx.db
          .query("eventArtifacts")
          .withIndex("by_sourceEmailMessage_and_eventId_and_index", (q) =>
            q.eq("sourceEmailAttachment.messageId", message._id).eq("eventId", eventId),
          )
          .take(MAX_ATTACHMENTS);
        for (const artifact of artifacts) {
          const source = artifact.sourceEmailAttachment;
          if (source) copied.add(attachmentSourceKey(source.messageId, source.index));
        }
      }
    }

    return {
      address,
      clientEmail,
      canAttachQuote,
      canReply,
      thread: { id: thread._id, messageCount: thread.messageCount },
      messages: newest.reverse().map((message) => ({
        _id: message._id,
        direction: message.direction,
        fromEmail: message.fromEmail,
        fromName: message.fromName,
        to: message.direction === "outbound" ? message.to : undefined,
        subject: message.subject,
        bodyText: message.bodyText,
        attachments: message.attachments.map((attachment, index) => ({
          filename: attachment.filename,
          inEventFiles: copied.has(attachmentSourceKey(message._id, index)),
        })),
        matchedBy: message.matchedBy,
        fromClient: clientEmails.has(message.fromEmail.toLowerCase()),
        receivedAt: message.receivedAt,
        changeRequestedAt: message.changeRequestedAt,
        canMakeChangeRequest:
          canReply && changeRequestBlocker({ message, invoice, clientEmails }) === null,
      })),
      failedReplies: failed
        .filter((row) => row.template === "booking_reply")
        .reverse()
        .map((row) => ({
          _id: row._id,
          to: row.to,
          cc: row.cc ?? [],
          bodyPreview: replyBody(row.payload).slice(0, FAILED_REPLY_PREVIEW_CHARS),
          error: row.error ?? "Unknown error.",
          createdAt: row.createdAt,
        })),
    };
  },
});

/**
 * The Reply-To, CC and subject the next client email about this invoice's booking
 * will use, for the quote sheets. Read-only: computes the subject a new thread
 * would get without creating one.
 */
export const bookingEmailPreview = query({
  args: { invoiceId: v.id("invoices"), to: v.string() },
  returns: v.object({
    from: v.string(),
    replyTo: v.string(),
    cc: v.array(v.string()),
    subject: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await previewBookingEmail(ctx, { invoiceId: args.invoiceId }, args.to);
  },
});

/**
 * Send the client a reply from the signed-in staff member, from the booking
 * sender, on the booking's thread. The send is queued like every booking email;
 * the thread shows it once it goes out.
 */
export const sendReply = mutation({
  args: {
    ...bookingRecordArgs,
    body: v.string(),
    attachQuote: v.boolean(),
    cc: v.optional(v.array(v.string())),
    /** Minted by the composer per attempt, so a double click queues one email. */
    clientRequestId: v.string(),
    sendAs: sendAsValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAdminOrOperations(ctx);

    const body = args.body.trim();
    if (!body) appError("EMAIL_REPLY_EMPTY", "Write a message before sending.");
    if (body.length > MAX_REPLY_CHARS) {
      appError("EMAIL_REPLY_TOO_LONG", `Replies are limited to ${MAX_REPLY_CHARS} characters, got ${body.length}.`);
    }
    const clientRequestId = args.clientRequestId.trim();
    if (!clientRequestId) appError("EMAIL_REPLY_REQUEST_ID", "The reply is missing its request id.");
    if (clientRequestId.length > MAX_CLIENT_REQUEST_ID_CHARS) {
      appError(
        "EMAIL_REPLY_REQUEST_ID_TOO_LONG",
        `The reply's request id is too long (max ${MAX_CLIENT_REQUEST_ID_CHARS}, got ${clientRequestId.length}).`,
      );
    }

    const ref = bookingRefFromArgs(args);
    const refs = await resolveBookingRefs(ctx, ref);
    const { request, invoice } = await loadBookingParties(
      ctx,
      refs,
      await findThreadForBooking(ctx, refs),
    );
    const toAddress = clientReplyAddress(request, invoice);
    if (!toAddress) {
      const unusable = request?.email?.trim() || invoice?.clientEmail?.trim();
      if (unusable) {
        appError("EMAIL_REPLY_BAD_CLIENT", `The client email "${unusable}" is not a valid address.`);
      }
      appError("EMAIL_REPLY_NO_CLIENT", "This booking has no client email to reply to.");
    }

    const cc: string[] = [];
    for (const raw of args.cc ?? []) {
      if (!raw.trim()) continue;
      const address = normalizePlainAddress(raw);
      if (!address) appError("EMAIL_REPLY_BAD_CC", `"${raw.trim()}" is not a valid email address.`);
      if (address !== toAddress && !cc.includes(address)) cc.push(address);
    }
    if (cc.length > MAX_REPLY_CC) {
      appError("EMAIL_REPLY_CC_LIMIT", `At most ${MAX_REPLY_CC} CC addresses, got ${cc.length}.`);
    }

    let quote: { invoiceId: Id<"invoices">; invoiceNumber: string } | null = null;
    if (args.attachQuote) {
      if (!hasAttachableQuote(invoice)) {
        appError("EMAIL_REPLY_NO_QUOTE", "This booking has no quote to attach.");
      }
      quote = { invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber };
    }

    const portal = await replyPortalLink(ctx, request, invoice);

    // The key names the thread, which only exists once the booking has one.
    const thread = await getOrCreateThreadForBooking(ctx, ref);
    // No name means plain "Arbor Live", never the invoice manager's name.
    const senderName = resolveSenderName(user, invoice, args.sendAs);

    await enqueueEmail(ctx, {
      template: "booking_reply",
      to: toAddress,
      cc: cc.length > 0 ? cc : undefined,
      booking: { ref, loaded: { request, invoice }, senderName },
      idempotencyKey: `booking_reply:${thread._id}:${clientRequestId}`,
      payload: {
        body,
        ...(senderName ? { senderName } : {}),
        ...(portal ? { portalUrl: portal.url, portalLabel: portal.label } : {}),
        ...(quote ? { attachQuote: true, ...quote } : {}),
      },
    });
    return null;
  },
});

/**
 * Turn a client's emailed reply into the formal quote change request, exactly
 * as if they had submitted it from their tracker.
 */
export const makeChangeRequest = mutation({
  args: { messageId: v.id("emailMessages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAdminOrOperations(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) appError("EMAIL_MESSAGE_NOT_FOUND", "Message not found.");
    const thread = message.threadId ? await ctx.db.get(message.threadId) : null;
    const ref = thread ? threadBookingRef(thread) : null;
    if (!ref) appError("EMAIL_CHANGE_NOT_INBOUND", "Only a client's reply on a booking can become a change request.");

    const { invoice, clientEmails } = await loadBookingParties(
      ctx,
      await resolveBookingRefs(ctx, ref),
      thread,
    );
    const blocker = changeRequestBlocker({ message, invoice, clientEmails });
    if (blocker) appError(blocker.code, blocker.message);
    if (!invoice) appError("EMAIL_CHANGE_NO_QUOTE", "This booking has no quote to change.");

    await requestInvoiceQuoteChanges(
      ctx,
      invoice,
      truncateOnWord(message.bodyText, MAX_CHANGE_NOTE_CHARS),
    );
    await ctx.db.patch(message._id, {
      changeRequestedAt: Date.now(),
      changeRequestedByUserId: getUserId(user),
    });
    return null;
  },
});

/**
 * Queue a failed reply again. Same notification and idempotency key, so the
 * client still gets one email and the thread records it once when it goes out.
 */
export const retryReply = mutation({
  args: { notificationId: v.id("emailNotifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireAdminOrOperations(ctx);
    const notification = await ctx.db.get(args.notificationId);
    if (!notification || notification.template !== "booking_reply" || !notification.booking) {
      appError("EMAIL_RETRY_NOT_FOUND", "Reply not found.");
    }
    if (notification.status !== "failed") {
      appError("EMAIL_RETRY_NOT_FAILED", "Only a reply that failed to send can be tried again.");
    }
    await ctx.db.patch(notification._id, { status: "queued", error: undefined });
    await ctx.scheduler.runAfter(0, internal.email.send.sendQueuedEmail, {
      notificationId: notification._id,
    });
    return null;
  },
});
