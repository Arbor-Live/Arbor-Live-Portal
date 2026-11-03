import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

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
 * The booking's thread, created on first use. Ids learned since the thread was
 * made (an invoice created after the request) are patched in, so the same
 * booking always converges on one row.
 */
export async function getOrCreateThreadForBooking(
  ctx: MutationCtx,
  ref: BookingRef,
  cache?: BookingDocCache,
): Promise<Doc<"emailThreads">> {
  const refs = await resolveBookingRefs(ctx, ref, cache);
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

  const patch: BookingRefs = {};
  if (refs.requestId && !existing.requestId) patch.requestId = refs.requestId;
  if (refs.invoiceId && !existing.invoiceId) patch.invoiceId = refs.invoiceId;
  if (refs.eventId && !existing.eventId) patch.eventId = refs.eventId;
  if (Object.keys(patch).length === 0) return existing;
  await ctx.db.patch(existing._id, patch);
  return { ...existing, ...patch };
}
