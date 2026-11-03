import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { BOOKINGS_EMAIL_FROM } from "../email/constants";
import { findAuthUsersByIds } from "./auth";
import { bookingAddressFor, extractEmailAddress, parseBookingAddress } from "./emailAddresses";
import {
  type BookingDocCache,
  type BookingRef,
  type BookingRefs,
  bookingDocCache,
  findThreadForBooking,
  getOrCreateThreadForBooking,
  type LoadedBookingDocs,
  resolveBookingRefs,
} from "./emailThreads";

/**
 * The thread's first message id plus the newest ones. Ten ids stay far below
 * the 998-character header line limit, and clients only need the root and the
 * recent chain to thread a reply.
 */
export const MAX_REFERENCES = 10;

const SUBJECT_PREFIX = "Arbor Live booking";
const REPLY_PREFIX = /^re:\s*/i;
const DEFAULT_BOOKINGS_ADDRESS = "bookings@arbor.st";

/** What an enqueue site passes so `enqueueEmail` sends the email on the booking's thread. */
export type BookingEmailSource = { ref: BookingRef; loaded?: LoadedBookingDocs };

export type BookingEmailEnvelope = {
  booking: { threadId: Id<"emailThreads">; from: string };
  /** The booking's own address, so a reply lands on its thread. */
  replyTo: string[];
  subject: string;
};

/** Quotes and angle brackets would break the From header; names never need them. */
function cleanDisplayName(name: string) {
  return name.replace(/["<>\\\r\n]/g, "").replace(/\s+/g, " ").trim();
}

function bookingsAddress() {
  return extractEmailAddress(BOOKINGS_EMAIL_FROM) ?? DEFAULT_BOOKINGS_ADDRESS;
}

export function bookingSenderFrom(managerName: string | undefined) {
  const name = managerName ? cleanDisplayName(managerName) : "";
  return `"${name ? `${name} at Arbor Live` : "Arbor Live"}" <${bookingsAddress()}>`;
}

/** `Re: ` once per subject, however many times a reply is replied to. */
export function replySubject(subject: string) {
  return `Re: ${subject.replace(REPLY_PREFIX, "")}`;
}

/**
 * `In-Reply-To` is the newest known message; `References` is the thread's root
 * followed by the newest ids, in order. Both without angle brackets.
 */
export function buildThreadReferences(thread: { root?: string; recent: readonly string[] }) {
  const tail = thread.recent.filter((id) => id !== thread.root);
  const references = thread.root
    ? [thread.root, ...tail.slice(-(MAX_REFERENCES - 1))]
    : tail.slice(-MAX_REFERENCES);
  return { inReplyTo: references.at(-1), references };
}

/** The wire form of `buildThreadReferences`: ids wrapped in angle brackets. */
export function threadHeaders(thread: { inReplyTo?: string; references: readonly string[] }) {
  const headers: { name: string; value: string }[] = [];
  if (thread.inReplyTo) headers.push({ name: "In-Reply-To", value: `<${thread.inReplyTo}>` });
  if (thread.references.length > 0) {
    headers.push({ name: "References", value: thread.references.map((id) => `<${id}>`).join(" ") });
  }
  return headers;
}

/**
 * The first booking address that routes back to this booking: request, then
 * invoice, then event. An old number the inbound parser can't read back falls
 * through to the next record, and the shared bookings inbox is the last resort.
 */
function routableReplyTo(docs: {
  request: Doc<"eventRequests"> | null;
  invoice: Doc<"invoices"> | null;
  eventId?: Id<"events">;
}) {
  const candidates = [
    docs.request
      ? bookingAddressFor({ kind: "request", requestNumber: docs.request.requestNumber })
      : null,
    docs.invoice
      ? bookingAddressFor({ kind: "invoice", invoiceNumber: docs.invoice.invoiceNumber })
      : null,
    docs.eventId ? bookingAddressFor({ kind: "event", id: docs.eventId }) : null,
  ];
  return (
    candidates.find((address) => address !== null && parseBookingAddress(address) !== null) ??
    bookingsAddress()
  );
}

/**
 * Sender, Reply-To and subject for the booking `refs` names. Read-only, so the
 * quote sheets can preview exactly what the next email will use.
 */
async function computeBookingEnvelope(
  ctx: QueryCtx | MutationCtx,
  thread: Pick<Doc<"emailThreads">, "subject" | "messageCount"> | null,
  refs: BookingRefs,
  cache: BookingDocCache,
) {
  const [request, invoice, event] = await Promise.all([
    refs.requestId ? cache.get(refs.requestId) : null,
    refs.invoiceId ? cache.get(refs.invoiceId) : null,
    refs.eventId ? cache.get(refs.eventId) : null,
  ]);

  let managerName = invoice?.managerName?.trim() || undefined;
  if (!managerName && request?.assigneeUserId) {
    const assignee = (await findAuthUsersByIds(ctx, [request.assigneeUserId])).get(
      request.assigneeUserId,
    );
    managerName = assignee?.name?.trim() || undefined;
  }

  const eventName =
    request?.eventName?.trim() ||
    event?.title?.trim() ||
    invoice?.clientGroupName?.trim() ||
    "Your event";
  const number = request?.requestNumber?.trim() || invoice?.invoiceNumber;
  const baseSubject =
    thread?.subject ?? `${SUBJECT_PREFIX}: ${eventName}${number ? ` (${number})` : ""}`;
  // Once a thread has a subject, or the client wrote first, the booking is already a conversation.
  const isReply = Boolean(thread?.subject) || (thread?.messageCount ?? 0) > 0;

  return {
    from: bookingSenderFrom(managerName),
    replyTo: routableReplyTo({ request, invoice, eventId: refs.eventId }),
    subject: isReply ? replySubject(baseSubject) : baseSubject,
    baseSubject,
  };
}

/**
 * Everything that makes a client booking email part of one conversation: the
 * booking thread, the booking sender, the booking address to reply to, and the
 * one subject the booking keeps. The first call stores the subject on the
 * thread; every later email replies to it.
 */
export async function resolveBookingEmail(
  ctx: MutationCtx,
  source: BookingEmailSource,
): Promise<BookingEmailEnvelope> {
  const cache = bookingDocCache(ctx, source.loaded);
  const thread = await getOrCreateThreadForBooking(ctx, source.ref, cache);
  const envelope = await computeBookingEnvelope(ctx, thread, thread, cache);
  if (!thread.subject) {
    await ctx.db.patch(thread._id, { subject: envelope.baseSubject });
  }
  return {
    booking: { threadId: thread._id, from: envelope.from },
    replyTo: [envelope.replyTo],
    subject: envelope.subject,
  };
}

/** What `resolveBookingEmail` would give the next email, without creating a thread. */
export async function previewBookingEmail(ctx: QueryCtx, ref: BookingRef) {
  const cache = bookingDocCache(ctx);
  const refs = await resolveBookingRefs(ctx, ref, cache);
  const thread = await findThreadForBooking(ctx, refs);
  const merged: BookingRefs = {
    requestId: thread?.requestId ?? refs.requestId,
    invoiceId: thread?.invoiceId ?? refs.invoiceId,
    eventId: thread?.eventId ?? refs.eventId,
  };
  const { from, replyTo, subject } = await computeBookingEnvelope(ctx, thread, merged, cache);
  return { from, replyTo, subject };
}
