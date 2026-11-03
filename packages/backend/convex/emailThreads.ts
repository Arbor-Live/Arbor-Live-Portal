import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";
import { appError } from "./lib/errors";
import { previewBookingEmail } from "./lib/bookingEmail";
import { bookingAddressFor } from "./lib/emailAddresses";
import {
  type BookingRef,
  findThreadForBooking,
  resolveBookingRefs,
} from "./lib/emailThreads";

/** Newest messages shown on a booking. A thread past this is a long negotiation, not normal traffic. */
const MESSAGE_LIMIT = 100;

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
});

/**
 * The booking conversation for a request, invoice or event page. A request, its
 * invoice and its event all resolve to the same thread. Read-only: the thread is
 * created by the first email on the booking, inbound or outbound, never by
 * looking at the page.
 */
export const getForRecord = query({
  args: {
    requestId: v.optional(v.id("eventRequests")),
    invoiceId: v.optional(v.id("invoices")),
    eventId: v.optional(v.id("events")),
  },
  returns: v.object({
    address: v.union(v.string(), v.null()),
    thread: v.union(v.object({ id: v.id("emailThreads"), messageCount: v.number() }), v.null()),
    messages: v.array(messageValue),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);

    let ref: BookingRef;
    if (args.requestId && !args.invoiceId && !args.eventId) {
      ref = { requestId: args.requestId };
    } else if (args.invoiceId && !args.requestId && !args.eventId) {
      ref = { invoiceId: args.invoiceId };
    } else if (args.eventId && !args.requestId && !args.invoiceId) {
      ref = { eventId: args.eventId };
    } else {
      return appError(
        "EMAIL_THREAD_REF",
        "Pass exactly one of requestId, invoiceId or eventId.",
      );
    }

    const refs = await resolveBookingRefs(ctx, ref);
    const [request, invoice] = await Promise.all([
      refs.requestId ? ctx.db.get(refs.requestId) : null,
      refs.invoiceId ? ctx.db.get(refs.invoiceId) : null,
    ]);
    // Every page of a booking shows its shortest address; the others still route.
    const address =
      (request ? bookingAddressFor({ kind: "request", requestNumber: request.requestNumber }) : null) ??
      (invoice ? bookingAddressFor({ kind: "invoice", invoiceNumber: invoice.invoiceNumber }) : null) ??
      (refs.eventId ? bookingAddressFor({ kind: "event", id: refs.eventId }) : null);

    const thread = await findThreadForBooking(ctx, refs);
    if (!thread) return { address, thread: null, messages: [] };

    const clientEmails = new Set(
      [request?.email, invoice?.clientEmail].flatMap((email) =>
        email?.trim() ? [email.trim().toLowerCase()] : [],
      ),
    );

    const newest = await ctx.db
      .query("emailMessages")
      .withIndex("by_threadId_and_receivedAt", (q) => q.eq("threadId", thread._id))
      .order("desc")
      .take(MESSAGE_LIMIT);

    return {
      address,
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
