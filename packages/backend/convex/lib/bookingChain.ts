import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { listAdditionalInvoiceIds } from "./eventInvoiceLinks";
import { listEventsLinkedToInvoice } from "./invoiceEvents";

export const bookingTargetValue = v.union(
  v.object({ kind: v.literal("request"), requestId: v.id("eventRequests") }),
  v.object({ kind: v.literal("invoice"), invoiceId: v.id("invoices") }),
  v.object({ kind: v.literal("event"), eventId: v.id("events") }),
);

export type BookingTarget = Infer<typeof bookingTargetValue>;

export type BookingChain = {
  requestIds: Id<"eventRequests">[];
  invoiceIds: Id<"invoices">[];
  eventIds: Id<"events">[];
};

/**
 * A booking is one request, a handful of quotes and the events on them. These
 * sit above what a real booking has (a series quote can carry a few dozen
 * events); past them the chain is cut off rather than read without bound.
 */
const MAX_REQUESTS = 25;
const MAX_INVOICES = 25;
const MAX_EVENTS = 100;
const MAX_REQUESTS_PER_INVOICE = 5;

function addCapped<T>(set: Set<T>, value: T, cap: number) {
  if (set.size < cap) set.add(value);
}

/**
 * Every request, quote and event of the booking `target` belongs to. Walks
 * target -> its quotes -> each quote's events and requests, one hop from the
 * quotes. Reads are bounded by the caps above.
 */
export async function resolveBookingChain(
  ctx: QueryCtx | MutationCtx,
  target: BookingTarget,
): Promise<BookingChain> {
  const requestIds = new Set<Id<"eventRequests">>();
  const invoiceIds = new Set<Id<"invoices">>();
  const eventIds = new Set<Id<"events">>();

  if (target.kind === "request") {
    requestIds.add(target.requestId);
    const request = await ctx.db.get(target.requestId);
    if (request?.linkedInvoiceId) addCapped(invoiceIds, request.linkedInvoiceId, MAX_INVOICES);
  } else if (target.kind === "invoice") {
    invoiceIds.add(target.invoiceId);
  } else {
    eventIds.add(target.eventId);
    const event = await ctx.db.get(target.eventId);
    if (event?.invoiceId) addCapped(invoiceIds, event.invoiceId, MAX_INVOICES);
    for (const invoiceId of await listAdditionalInvoiceIds(ctx, target.eventId)) {
      addCapped(invoiceIds, invoiceId, MAX_INVOICES);
    }
  }

  for (const invoiceId of [...invoiceIds]) {
    for (const event of await listEventsLinkedToInvoice(ctx, invoiceId)) {
      addCapped(eventIds, event._id, MAX_EVENTS);
    }
    const linkedRequests = await ctx.db
      .query("eventRequests")
      .withIndex("by_linkedInvoiceId", (q) => q.eq("linkedInvoiceId", invoiceId))
      .take(MAX_REQUESTS_PER_INVOICE);
    for (const request of linkedRequests) addCapped(requestIds, request._id, MAX_REQUESTS);
    const invoice = await ctx.db.get(invoiceId);
    if (invoice?.sourceEventRequestId) {
      addCapped(requestIds, invoice.sourceEventRequestId, MAX_REQUESTS);
    }
  }

  return {
    requestIds: [...requestIds],
    invoiceIds: [...invoiceIds],
    eventIds: [...eventIds],
  };
}
