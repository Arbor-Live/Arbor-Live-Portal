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
const MAX_LINKS_PER_RECORD = 10;

/**
 * Every request, quote and event of the booking `target` belongs to: all records
 * reachable through request <-> quote <-> event links, including follow-up quotes
 * attached to an event. The walk runs until nothing new turns up, so any record
 * of a booking resolves to the same chain. Reads are bounded by the caps above.
 */
export async function resolveBookingChain(
  ctx: QueryCtx | MutationCtx,
  target: BookingTarget,
): Promise<BookingChain> {
  const requestIds = new Set<Id<"eventRequests">>();
  const invoiceIds = new Set<Id<"invoices">>();
  const eventIds = new Set<Id<"events">>();
  const queue: BookingTarget[] = [];

  const visit = (next: BookingTarget) => {
    const [seen, id, cap] =
      next.kind === "request"
        ? [requestIds as Set<string>, next.requestId, MAX_REQUESTS]
        : next.kind === "invoice"
          ? [invoiceIds as Set<string>, next.invoiceId, MAX_INVOICES]
          : [eventIds as Set<string>, next.eventId, MAX_EVENTS];
    if (seen.has(id) || seen.size >= cap) return;
    seen.add(id);
    queue.push(next);
  };

  visit(target);
  for (let next = queue.shift(); next; next = queue.shift()) {
    if (next.kind === "request") {
      const request = await ctx.db.get(next.requestId);
      if (request?.linkedInvoiceId) visit({ kind: "invoice", invoiceId: request.linkedInvoiceId });
      const quotes = await ctx.db
        .query("invoices")
        .withIndex("by_sourceEventRequestId", (q) => q.eq("sourceEventRequestId", next.requestId))
        .take(MAX_LINKS_PER_RECORD);
      for (const quote of quotes) visit({ kind: "invoice", invoiceId: quote._id });
    } else if (next.kind === "invoice") {
      const invoice = await ctx.db.get(next.invoiceId);
      if (invoice?.sourceEventRequestId) visit({ kind: "request", requestId: invoice.sourceEventRequestId });
      const requests = await ctx.db
        .query("eventRequests")
        .withIndex("by_linkedInvoiceId", (q) => q.eq("linkedInvoiceId", next.invoiceId))
        .take(MAX_LINKS_PER_RECORD);
      for (const request of requests) visit({ kind: "request", requestId: request._id });
      for (const event of await listEventsLinkedToInvoice(ctx, next.invoiceId)) {
        visit({ kind: "event", eventId: event._id });
      }
    } else {
      const event = await ctx.db.get(next.eventId);
      if (event?.invoiceId) visit({ kind: "invoice", invoiceId: event.invoiceId });
      for (const invoiceId of await listAdditionalInvoiceIds(ctx, next.eventId)) {
        visit({ kind: "invoice", invoiceId });
      }
    }
  }

  return {
    requestIds: [...requestIds],
    invoiceIds: [...invoiceIds],
    eventIds: [...eventIds],
  };
}
