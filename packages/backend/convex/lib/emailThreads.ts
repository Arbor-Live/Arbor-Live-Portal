import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { appError } from "./errors";
import { normalizePlainAddress } from "./emailAddresses";

/**
 * A booking is the request, its invoice and its events, joined by
 * `invoices.sourceEventRequestId`, `eventRequests.linkedInvoiceId`,
 * `events.invoiceId` (the primary invoice) and `events.sourceEventRequestId`.
 * Every one of them shows the same thread.
 */
export type BookingRefs = {
  requestId?: Id<"eventRequests">;
  invoiceId?: Id<"invoices">;
  eventId?: Id<"events">;
};

export type BookingRef =
  | { requestId: Id<"eventRequests"> }
  | { invoiceId: Id<"invoices"> }
  | { eventId: Id<"events"> };

/** Two passes reach event → invoice → request; more would only repeat reads. */
const RESOLVE_PASSES = 2;

/** Booking docs a caller already holds, so resolving the booking does not read them again. */
export type LoadedBookingDocs = {
  request?: Doc<"eventRequests"> | null;
  invoice?: Doc<"invoices"> | null;
  event?: Doc<"events"> | null;
};

type BookingTable = "eventRequests" | "invoices" | "events";

/** Reads each request, invoice and event at most once per resolution. */
export function bookingDocCache(ctx: QueryCtx | MutationCtx, loaded: LoadedBookingDocs = {}) {
  const docs = new Map<string, Doc<BookingTable> | null>();
  for (const doc of [loaded.request, loaded.invoice, loaded.event]) {
    if (doc) docs.set(doc._id, doc);
  }
  return {
    async get<T extends BookingTable>(id: Id<T>): Promise<Doc<T> | null> {
      if (docs.has(id)) return docs.get(id) as Doc<T> | null;
      const doc = await ctx.db.get(id);
      docs.set(id, doc as Doc<BookingTable> | null);
      return doc;
    },
  };
}

export type BookingDocCache = ReturnType<typeof bookingDocCache>;

/**
 * Every known `{requestId, invoiceId, eventId}` for the booking `ref` belongs
 * to. A booking can have several events; the thread tracks the first one found,
 * and the other events reach it through the request or invoice.
 */
export async function resolveBookingRefs(
  ctx: QueryCtx | MutationCtx,
  ref: BookingRef,
  cache: BookingDocCache = bookingDocCache(ctx),
): Promise<BookingRefs> {
  const refs: BookingRefs = {
    requestId: "requestId" in ref ? ref.requestId : undefined,
    invoiceId: "invoiceId" in ref ? ref.invoiceId : undefined,
    eventId: "eventId" in ref ? ref.eventId : undefined,
  };

  for (let pass = 0; pass < RESOLVE_PASSES; pass += 1) {
    const before = `${refs.requestId}|${refs.invoiceId}|${refs.eventId}`;

    if (refs.requestId) {
      const request = await cache.get(refs.requestId);
      refs.invoiceId ??= request?.linkedInvoiceId;
      if (!refs.invoiceId) {
        const invoice = await ctx.db
          .query("invoices")
          .withIndex("by_sourceEventRequestId", (q) =>
            q.eq("sourceEventRequestId", refs.requestId),
          )
          .first();
        refs.invoiceId = invoice?._id;
      }
      if (!refs.eventId) {
        const event = await ctx.db
          .query("events")
          .withIndex("by_sourceEventRequestId", (q) =>
            q.eq("sourceEventRequestId", refs.requestId),
          )
          .first();
        refs.eventId = event?._id ?? request?.convertedEventId;
      }
    }

    if (refs.invoiceId) {
      if (!refs.requestId) {
        const invoice = await cache.get(refs.invoiceId);
        refs.requestId = invoice?.sourceEventRequestId;
        if (!refs.requestId) {
          const request = await ctx.db
            .query("eventRequests")
            .withIndex("by_linkedInvoiceId", (q) => q.eq("linkedInvoiceId", refs.invoiceId))
            .first();
          refs.requestId = request?._id;
        }
      }
      if (!refs.eventId) {
        const event = await ctx.db
          .query("events")
          .withIndex("by_invoiceId", (q) => q.eq("invoiceId", refs.invoiceId))
          .first();
        refs.eventId = event?._id;
      }
    }

    if (refs.eventId) {
      const event = await cache.get(refs.eventId);
      refs.invoiceId ??= event?.invoiceId;
      refs.requestId ??= event?.sourceEventRequestId;
    }

    if (before === `${refs.requestId}|${refs.invoiceId}|${refs.eventId}`) break;
  }

  return refs;
}

/** The first thread matching any known id: request, then invoice, then event. */
export async function findThreadForBooking(
  ctx: QueryCtx | MutationCtx,
  refs: BookingRefs,
): Promise<Doc<"emailThreads"> | null> {
  const { requestId, invoiceId, eventId } = refs;
  if (requestId) {
    const thread = await ctx.db
      .query("emailThreads")
      .withIndex("by_requestId", (q) => q.eq("requestId", requestId))
      .first();
    if (thread) return thread;
  }
  if (invoiceId) {
    const thread = await ctx.db
      .query("emailThreads")
      .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
      .first();
    if (thread) return thread;
  }
  if (eventId) {
    const thread = await ctx.db
      .query("emailThreads")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .first();
    if (thread) return thread;
  }
  return null;
}

/**
 * The thread's ids, with the gaps filled from `refs`. A stored invoice or event
 * that was deleted gives way to the one the booking resolves to now. A live one
 * stays, since change requests from the thread file against the thread's quote.
 */
export async function currentThreadRefs(
  thread: BookingRefs | null,
  refs: BookingRefs,
  cache: BookingDocCache,
): Promise<BookingRefs> {
  async function pick<T extends "invoices" | "events">(stored?: Id<T>, resolved?: Id<T>) {
    if (!stored || !resolved || stored === resolved) return stored ?? resolved;
    return (await cache.get(stored)) ? stored : resolved;
  }
  return {
    requestId: thread?.requestId ?? refs.requestId,
    invoiceId: await pick(thread?.invoiceId, refs.invoiceId),
    eventId: await pick(thread?.eventId, refs.eventId),
  };
}

/**
 * The booking's thread, created on first use. Ids learned since the thread was
 * made (an invoice created after the request) are patched in, so the same
 * booking always converges on one row.
 */
export async function getOrCreateThreadForBooking(
  ctx: MutationCtx,
  ref: BookingRef,
  cache: BookingDocCache = bookingDocCache(ctx),
): Promise<Doc<"emailThreads">> {
  return await getOrCreateThreadForRefs(ctx, await resolveBookingRefs(ctx, ref, cache), cache);
}

/** `getOrCreateThreadForBooking` for ids the caller already resolved. */
export async function getOrCreateThreadForRefs(
  ctx: MutationCtx,
  refs: BookingRefs,
  cache: BookingDocCache,
): Promise<Doc<"emailThreads">> {
  const existing = await findThreadForBooking(ctx, refs);
  if (!existing) {
    const now = Date.now();
    const threadId = await ctx.db.insert("emailThreads", {
      ...refs,
      lastMessageAt: now,
      messageCount: 0,
      createdAt: now,
    });
    const created = await ctx.db.get(threadId);
    if (!created) throw new Error("emailThreads insert vanished");
    return created;
  }

  const current = await currentThreadRefs(existing, refs, cache);
  const patch: BookingRefs = {};
  if (current.requestId !== existing.requestId) patch.requestId = current.requestId;
  if (current.invoiceId !== existing.invoiceId) patch.invoiceId = current.invoiceId;
  if (current.eventId !== existing.eventId) patch.eventId = current.eventId;
  if (Object.keys(patch).length === 0) return existing;
  await ctx.db.patch(existing._id, patch);
  return { ...existing, ...patch };
}

/** The one booking record a staff query or mutation names; anything else is a caller bug. */
export function bookingRefFromArgs(args: {
  requestId?: Id<"eventRequests">;
  invoiceId?: Id<"invoices">;
  eventId?: Id<"events">;
}): BookingRef {
  const given = [args.requestId, args.invoiceId, args.eventId].filter(Boolean).length;
  if (given === 1) {
    if (args.requestId) return { requestId: args.requestId };
    if (args.invoiceId) return { invoiceId: args.invoiceId };
    if (args.eventId) return { eventId: args.eventId };
  }
  return appError("EMAIL_THREAD_REF", "Pass exactly one of requestId, invoiceId or eventId.");
}

/** Any one record the thread tracks reaches the whole booking. */
export function threadBookingRef(thread: Doc<"emailThreads">): BookingRef | null {
  if (thread.requestId) return { requestId: thread.requestId };
  if (thread.invoiceId) return { invoiceId: thread.invoiceId };
  if (thread.eventId) return { eventId: thread.eventId };
  return null;
}

/**
 * The booking's request and invoice, and the addresses that count as the client.
 * The invoice is the thread's own first (`thread.invoiceId`), then the request's
 * `linkedInvoiceId`, then whichever the caller named, so the page that shows a
 * message and the action that uses it always read the same quote.
 */
export async function loadBookingParties(
  ctx: QueryCtx | MutationCtx,
  refs: BookingRefs,
  thread: Pick<Doc<"emailThreads">, "invoiceId"> | null,
) {
  const request = refs.requestId ? await ctx.db.get(refs.requestId) : null;
  const invoiceId = thread?.invoiceId ?? request?.linkedInvoiceId ?? refs.invoiceId;
  const invoice = invoiceId ? await ctx.db.get(invoiceId) : null;
  const clientEmails = new Set(
    [request?.email, invoice?.clientEmail].flatMap((email) =>
      email?.trim() ? [email.trim().toLowerCase()] : [],
    ),
  );
  return { request, invoice, clientEmails };
}

/** The address staff reply to: the request's contact, else the invoice's, whichever is a usable address. */
export function clientReplyAddress(
  request: Doc<"eventRequests"> | null,
  invoice: Doc<"invoices"> | null,
) {
  for (const raw of [request?.email, invoice?.clientEmail]) {
    const address = raw ? normalizePlainAddress(raw) : null;
    if (address) return address;
  }
  return null;
}

/** A change-request note longer than this is cut; the full email stays on the thread. */
export const MAX_CHANGE_NOTE_CHARS = 2000;

/** `text` trimmed to at most `max` characters, cut at a word boundary with a trailing `…`. */
export function truncateOnWord(text: string, max: number) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  let cut = trimmed.slice(0, max - 1);
  if (!/\s/.test(trimmed[max - 1]!)) {
    const lastSpace = cut.search(/\s\S*$/);
    if (lastSpace > 0) cut = cut.slice(0, lastSpace);
  }
  // A cut through a surrogate pair would leave an invalid string.
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

/** An invoice whose current quote can go out as a PDF. */
export function hasAttachableQuote(invoice: Doc<"invoices"> | null): invoice is Doc<"invoices"> {
  return Boolean(invoice && invoice.status !== "void");
}

/**
 * Why a client message cannot become a change request, or null when it can.
 * One rule set for the button (`getForRecord`) and the action (`makeChangeRequest`).
 */
export function changeRequestBlocker(args: {
  message: Doc<"emailMessages">;
  invoice: Doc<"invoices"> | null;
  clientEmails: ReadonlySet<string>;
}): { code: string; message: string } | null {
  const { message, invoice, clientEmails } = args;
  if (message.changeRequestedAt) {
    return { code: "EMAIL_CHANGE_ALREADY_REQUESTED", message: "This message is already a change request." };
  }
  if (message.direction !== "inbound" || !message.threadId) {
    return { code: "EMAIL_CHANGE_NOT_INBOUND", message: "Only a client's reply can become a change request." };
  }
  if (!hasAttachableQuote(invoice)) {
    return { code: "EMAIL_CHANGE_NO_QUOTE", message: "This booking has no quote to change." };
  }
  if (!invoice.clientReviewReadyAt) {
    return { code: "EMAIL_CHANGE_QUOTE_NOT_READY", message: "The quote has not been sent to the client for review." };
  }
  if (message.receivedAt < invoice.clientReviewReadyAt) {
    return {
      code: "EMAIL_CHANGE_STALE",
      message: "This message arrived before the current quote was sent for review.",
    };
  }
  if ((invoice.clientApprovalStatus ?? "pending") !== "pending") {
    return { code: "EMAIL_CHANGE_QUOTE_DECIDED", message: "The client already decided on this quote." };
  }
  if (!clientEmails.has(message.fromEmail.trim().toLowerCase())) {
    return { code: "EMAIL_CHANGE_NOT_FROM_CLIENT", message: "This message is not from the booking's client." };
  }
  if (!message.bodyText.trim()) {
    return { code: "EMAIL_CHANGE_EMPTY", message: "This message has no text to use as the change note." };
  }
  return null;
}
