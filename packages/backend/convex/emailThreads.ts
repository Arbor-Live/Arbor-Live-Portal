import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { getUserId, requireArborInternalContext, requireAuth } from "./lib/auth";
import { appError } from "./lib/errors";
import { previewBookingEmail } from "./lib/bookingEmail";
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
  resolveBookingRefs,
  threadBookingRef,
} from "./lib/emailThreads";
import { publicQuoteUrl, requestTrackingUrl } from "./email/constants";
import { enqueueEmail } from "./email/enqueue";

/** Newest messages shown on a booking. A thread past this is a long negotiation, not normal traffic. */
const MESSAGE_LIMIT = 100;

/** A reply is a few paragraphs; the cap stops a paste of a whole document. */
export const MAX_REPLY_CHARS = 10_000;
/** A manager copies a colleague or two; ten is a mailing list. */
export const MAX_REPLY_CC = 10;
const MAX_CLIENT_REQUEST_ID_CHARS = 100;

const messageValue = v.object({
  _id: v.id("emailMessages"),
  direction: v.union(v.literal("inbound"), v.literal("outbound")),
  fromEmail: v.string(),
  fromName: v.optional(v.string()),
  /** Recipients of an email we sent; inbound mail always went to the booking address. */
  to: v.optional(v.array(v.string())),
  subject: v.string(),
  bodyText: v.string(),
  attachments: v.array(v.object({ filename: v.string() })),
  matchedBy: v.optional(v.union(v.literal("address"), v.literal("header"))),
  /** Sent by the booking's client (request or invoice contact) rather than by staff or a third party. */
  fromClient: v.boolean(),
  receivedAt: v.number(),
  changeRequestedAt: v.optional(v.number()),
  /** Staff may turn this message into the quote change request (server-checked again on click). */
  canMakeChangeRequest: v.boolean(),
});

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
    thread: v.union(v.object({ id: v.id("emailThreads"), messageCount: v.number() }), v.null()),
    messages: v.array(messageValue),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);

    const refs = await resolveBookingRefs(ctx, bookingRefFromArgs(args));
    const { request, invoice, clientEmails } = await loadBookingParties(ctx, refs);
    // Every page of a booking shows its shortest address; the others still route.
    const address =
      (request ? bookingAddressFor({ kind: "request", requestNumber: request.requestNumber }) : null) ??
      (invoice ? bookingAddressFor({ kind: "invoice", invoiceNumber: invoice.invoiceNumber }) : null) ??
      (refs.eventId ? bookingAddressFor({ kind: "event", id: refs.eventId }) : null);

    const clientEmail = clientReplyAddress(request, invoice);
    const canAttachQuote = hasAttachableQuote(invoice);

    const thread = await findThreadForBooking(ctx, refs);
    if (!thread) return { address, clientEmail, canAttachQuote, thread: null, messages: [] };

    const newest = await ctx.db
      .query("emailMessages")
      .withIndex("by_threadId_and_receivedAt", (q) => q.eq("threadId", thread._id))
      .order("desc")
      .take(MESSAGE_LIMIT);

    return {
      address,
      clientEmail,
      canAttachQuote,
      thread: { id: thread._id, messageCount: thread.messageCount },
      messages: newest.reverse().map((message) => ({
        _id: message._id,
        direction: message.direction,
        fromEmail: message.fromEmail,
        fromName: message.fromName,
        to: message.direction === "outbound" ? message.to : undefined,
        subject: message.subject,
        bodyText: message.bodyText,
        attachments: message.attachments.map((attachment) => ({ filename: attachment.filename })),
        matchedBy: message.matchedBy,
        fromClient: clientEmails.has(message.fromEmail.toLowerCase()),
        receivedAt: message.receivedAt,
        changeRequestedAt: message.changeRequestedAt,
        canMakeChangeRequest: changeRequestBlocker({ message, invoice, clientEmails }) === null,
      })),
    };
  },
});

/**
 * The Reply-To and subject the next client email about this invoice's booking
 * will use, for the quote sheets. Read-only: computes the subject a new thread
 * would get without creating one.
 */
export const bookingEmailPreview = query({
  args: { invoiceId: v.id("invoices") },
  returns: v.object({ from: v.string(), replyTo: v.string(), subject: v.string() }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return await previewBookingEmail(ctx, { invoiceId: args.invoiceId });
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);

    const body = args.body.trim();
    if (!body) appError("EMAIL_REPLY_EMPTY", "Write a message before sending.");
    if (body.length > MAX_REPLY_CHARS) {
      appError("EMAIL_REPLY_TOO_LONG", `Replies are limited to ${MAX_REPLY_CHARS} characters, got ${body.length}.`);
    }
    const clientRequestId = args.clientRequestId.trim();
    if (!clientRequestId || clientRequestId.length > MAX_CLIENT_REQUEST_ID_CHARS) {
      appError("EMAIL_REPLY_REQUEST_ID", "The reply is missing its request id.");
    }

    const ref = bookingRefFromArgs(args);
    const refs = await resolveBookingRefs(ctx, ref);
    const { request, invoice } = await loadBookingParties(ctx, refs);
    const to = clientReplyAddress(request, invoice);
    if (!to) appError("EMAIL_REPLY_NO_CLIENT", "This booking has no client email to reply to.");
    const toAddress = normalizePlainAddress(to);
    if (!toAddress) {
      appError("EMAIL_REPLY_BAD_CLIENT", `The client email "${to}" is not a valid address.`);
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

    let portalUrl: string | undefined;
    let portalLabel: string | undefined;
    const invoicePortal = invoice ? await resolvePortalTokenForInvoice(ctx, invoice) : null;
    if (invoicePortal) {
      portalUrl =
        invoicePortal.portal === "request"
          ? requestTrackingUrl(invoicePortal.token)
          : publicQuoteUrl(invoicePortal.token);
      portalLabel = invoicePortal.portal === "request" ? "Open your request tracker" : "Open your quote";
    } else if (request?.publicToken && !isRequestPublicTokenExpired(request)) {
      portalUrl = requestTrackingUrl(request.publicToken);
      portalLabel = "Open your request tracker";
    }

    // The key names the thread, which only exists once the booking has one.
    const thread = await getOrCreateThreadForBooking(ctx, ref);
    const senderName = user.name?.trim() || undefined;

    await enqueueEmail(ctx, {
      template: "booking_reply",
      to: toAddress,
      cc: cc.length > 0 ? cc : undefined,
      booking: { ref, loaded: { request, invoice }, senderName },
      idempotencyKey: `booking_reply:${thread._id}:${clientRequestId}`,
      payload: {
        body,
        senderName: senderName ?? "Arbor Live",
        portalUrl,
        portalLabel,
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
    const user = await requireAuth(ctx);
    await requireArborInternalContext(ctx);

    const message = await ctx.db.get(args.messageId);
    if (!message) appError("EMAIL_MESSAGE_NOT_FOUND", "Message not found.");
    const thread = message.threadId ? await ctx.db.get(message.threadId) : null;
    const ref = thread ? threadBookingRef(thread) : null;
    if (!ref) appError("EMAIL_CHANGE_NOT_INBOUND", "Only a client's reply on a booking can become a change request.");

    const { invoice, clientEmails } = await loadBookingParties(ctx, await resolveBookingRefs(ctx, ref));
    const blocker = changeRequestBlocker({ message, invoice, clientEmails });
    if (blocker) appError(blocker.code, blocker.message);
    if (!invoice) appError("EMAIL_CHANGE_NO_QUOTE", "This booking has no quote to change.");

    await requestInvoiceQuoteChanges(ctx, invoice, message.bodyText);
    await ctx.db.patch(message._id, {
      changeRequestedAt: Date.now(),
      changeRequestedByUserId: getUserId(user),
    });
    return null;
  },
});
