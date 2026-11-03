import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { BOOKINGS_EMAIL_FROM } from "../email/constants";
import { findAuthUsersByIds } from "./auth";
import { bookingAddressFor, extractEmailAddress } from "./emailAddresses";
import { type BookingRef, getOrCreateThreadForBooking } from "./emailThreads";

/** `References` grows with every message; mail clients only need the recent chain. */
export const MAX_REFERENCES = 20;

const SUBJECT_PREFIX = "Arbor Live booking";
const REPLY_PREFIX = /^re:\s*/i;

export type BookingEmailEnvelope = {
  emailThreadId: Id<"emailThreads">;
  /** Full From header: `"<Manager> at Arbor Live" <bookings@arbor.st>`. */
  from: string;
  /** The booking's own address, so a reply lands on its thread. */
  replyTo: string[];
  subject: string;
};

/** Quotes and angle brackets would break the From header; names never need them. */
function cleanDisplayName(name: string) {
  return name.replace(/["<>\\\r\n]/g, "").replace(/\s+/g, " ").trim();
}

export function bookingSenderFrom(managerName: string | undefined) {
  const address = extractEmailAddress(BOOKINGS_EMAIL_FROM) ?? "bookings@arbor.st";
  const name = managerName ? cleanDisplayName(managerName) : "";
  return `"${name ? `${name} at Arbor Live` : "Arbor Live"}" <${address}>`;
}

/** `Re: ` once per subject, however many times a reply is replied to. */
export function replySubject(subject: string) {
  return `Re: ${subject.replace(REPLY_PREFIX, "")}`;
}

/**
 * `In-Reply-To` is the newest known message; `References` is every known id in
 * thread order. Both without angle brackets (callers wrap them for the wire).
 */
export function buildThreadReferences(messageIds: readonly string[]) {
  const references = messageIds.slice(-MAX_REFERENCES);
  return { inReplyTo: references.at(-1), references };
}

/** The wire form of `buildThreadReferences`: ids wrapped in angle brackets. */
export function threadHeaderFields(thread: { inReplyTo?: string; references: readonly string[] }) {
  const headers: Record<string, string> = {};
  if (thread.inReplyTo) headers["In-Reply-To"] = `<${thread.inReplyTo}>`;
  if (thread.references.length > 0) {
    headers["References"] = thread.references.map((id) => `<${id}>`).join(" ");
  }
  return headers;
}

/**
 * Everything that makes a client booking email part of one conversation: the
 * booking thread, the booking sender, the booking address to reply to, and the
 * one subject the booking keeps. Every enqueue site spreads this into
 * `enqueueEmail`; the sender, subject and thread never vary per template.
 *
 * `idempotencyKey` is the email being enqueued, so re-queueing it after a
 * failure still counts as the first message of the thread.
 */
export async function resolveBookingEmail(
  ctx: MutationCtx,
  args: { ref: BookingRef; idempotencyKey: string },
): Promise<BookingEmailEnvelope> {
  const thread = await getOrCreateThreadForBooking(ctx, args.ref);
  const [request, invoice, event] = await Promise.all([
    thread.requestId ? ctx.db.get(thread.requestId) : null,
    thread.invoiceId ? ctx.db.get(thread.invoiceId) : null,
    thread.eventId ? ctx.db.get(thread.eventId) : null,
  ]);

  const replyTo =
    (request ? bookingAddressFor({ kind: "request", requestNumber: request.requestNumber }) : null) ??
    (invoice ? bookingAddressFor({ kind: "invoice", invoiceNumber: invoice.invoiceNumber }) : null) ??
    (thread.eventId ? bookingAddressFor({ kind: "event", id: thread.eventId }) : null);

  let managerName = invoice?.managerName?.trim() || undefined;
  if (!managerName && request?.assigneeUserId) {
    const assignee = (await findAuthUsersByIds(ctx, [request.assigneeUserId])).get(
      request.assigneeUserId,
    );
    managerName = assignee?.name?.trim() || undefined;
  }

  // Later messages reuse the first one's subject, so a renamed event does not split the conversation.
  const sent = await ctx.db
    .query("emailNotifications")
    .withIndex("by_emailThreadId", (q) => q.eq("emailThreadId", thread._id))
    .take(5);
  const earlier = sent.find(
    (notification) =>
      notification.idempotencyKey !== args.idempotencyKey && notification.status !== "failed",
  );

  let subject: string;
  if (earlier) {
    subject = replySubject(earlier.subject);
  } else {
    const eventName =
      request?.eventName?.trim() ||
      event?.title?.trim() ||
      invoice?.clientGroupName?.trim() ||
      "Your event";
    const number = request?.requestNumber?.trim() || invoice?.invoiceNumber;
    const base = `${SUBJECT_PREFIX}: ${eventName}${number ? ` (${number})` : ""}`;
    // A client who wrote first is already in a conversation.
    subject = thread.messageCount > 0 ? replySubject(base) : base;
  }

  return {
    emailThreadId: thread._id,
    from: bookingSenderFrom(managerName),
    replyTo: [replyTo ?? (extractEmailAddress(BOOKINGS_EMAIL_FROM) ?? "bookings@arbor.st")],
    subject,
  };
}
