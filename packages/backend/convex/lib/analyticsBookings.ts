import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { listAdditionalInvoiceIds } from "./eventInvoiceLinks";
import { normalizeEventStatus } from "./eventStatus";
import {
  arborEarnedRevenueUsd,
  eventPassThroughCostUsd,
  invoicePassThroughUsd,
  netProfitCostUsd,
} from "./invoiceProfit";

/** Ceiling on events counted per invoice when splitting it (a long series). */
const EVENTS_PER_INVOICE_LIMIT = 200;

/** A finalized quote the client approved: revenue Arbor can count on. */
export function isBookedInvoice(invoice: Doc<"invoices"> | null): invoice is Doc<"invoices"> {
  if (!invoice || invoice.status === "void") return false;
  return (
    invoice.status === "finalized" && (invoice.clientApprovalStatus ?? "pending") === "approved"
  );
}

export function eventCostUsd(event: Doc<"events">): number {
  return (
    (event.crewCostUsd ?? 0) +
    (event.bandsCostUsd ?? 0) +
    (event.externalRentalsCostUsd ?? 0) +
    (event.otherCostUsd ?? 0)
  );
}

type InvoiceWithReach = {
  invoice: Doc<"invoices">;
  /** Distinct non-cancelled events on the invoice (primary or extra link), at least 1. */
  eventCount: number;
  /** Distinct events on the invoice including cancelled ones, at least 1. */
  totalEventCount: number;
};

/**
 * Loads invoices once per query, with how many events each covers. A
 * multi-day booking or a series shares one invoice, so each live event takes
 * `1 / eventCount` of it; summing per event then never counts a shared
 * invoice twice. Queries about cancelled events split by `totalEventCount`
 * instead, so cancelled days never claim a live day's share.
 */
export function createInvoiceLoader(ctx: QueryCtx) {
  const cache = new Map<Id<"invoices">, Promise<InvoiceWithReach | null>>();
  return (invoiceId: Id<"invoices">) => {
    let pending = cache.get(invoiceId);
    if (!pending) {
      pending = (async () => {
        const invoice = await ctx.db.get(invoiceId);
        if (!invoice) return null;
        const [primaryEvents, extraLinks] = await Promise.all([
          ctx.db
            .query("events")
            .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
            .take(EVENTS_PER_INVOICE_LIMIT),
          ctx.db
            .query("eventInvoiceLinks")
            .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
            .take(EVENTS_PER_INVOICE_LIMIT),
        ]);
        // One set of events, whether the invoice is their primary or an extra
        // link (an event can be both); cancelled ones counted separately.
        const statusById = new Map<string, string | undefined>(
          primaryEvents.map((event) => [event._id, event.status]),
        );
        const extraEvents = await Promise.all(
          extraLinks
            .filter((link) => !statusById.has(link.eventId))
            .map((link) => ctx.db.get(link.eventId)),
        );
        for (const event of extraEvents) {
          if (event) statusById.set(event._id, event.status);
        }
        const live = [...statusById.values()].filter(
          (status) => normalizeEventStatus(status) !== "cancelled",
        ).length;
        return {
          invoice,
          eventCount: Math.max(1, live),
          totalEventCount: Math.max(1, statusById.size),
        };
      })();
      cache.set(invoiceId, pending);
    }
    return pending;
  };
}

export type InvoiceLoader = ReturnType<typeof createInvoiceLoader>;

export type EventBooking = {
  /** True when at least one linked invoice is booked (finalized + approved). */
  booked: boolean;
  /** This event's share of booked invoice totals, net of pass-through. */
  earnedRevenueUsd: number;
  /** This event's share of artist + external rental lines billed to the host. */
  passThroughBilledUsd: number;
  /** This event's share of the crew lines billed to the host. */
  crewBilledUsd: number;
  invoiceIds: Id<"invoices">[];
};

/** The event's slice of every booked invoice linked to it (primary + extra links). */
export async function loadEventBooking(
  ctx: QueryCtx,
  loadInvoice: InvoiceLoader,
  event: Doc<"events">,
): Promise<EventBooking> {
  const additional = await listAdditionalInvoiceIds(ctx, event._id);
  const invoiceIds = [
    ...(event.invoiceId ? [event.invoiceId] : []),
    ...additional.filter((invoiceId) => invoiceId !== event.invoiceId),
  ];
  const booking: EventBooking = {
    booked: false,
    earnedRevenueUsd: 0,
    passThroughBilledUsd: 0,
    crewBilledUsd: 0,
    invoiceIds,
  };
  for (const invoiceId of invoiceIds) {
    const loaded = await loadInvoice(invoiceId);
    if (!loaded || !isBookedInvoice(loaded.invoice)) continue;
    const { invoice, eventCount } = loaded;
    const passThrough = invoicePassThroughUsd(
      invoice.artistsSubtotalUsd,
      invoice.externalRentalsSubtotalUsd,
    );
    booking.booked = true;
    booking.earnedRevenueUsd += arborEarnedRevenueUsd(invoice.totalUsd, passThrough) / eventCount;
    booking.passThroughBilledUsd += passThrough / eventCount;
    booking.crewBilledUsd += Math.max(0, invoice.crewSubtotalUsd) / eventCount;
  }
  return booking;
}

/**
 * Net profit for one event from its booking slice: earned revenue minus the
 * event costs that hit Arbor's margin (pass-through costs the host already
 * paid for are not subtracted twice; overruns still count).
 */
export function eventNetProfitUsd(event: Doc<"events">, booking: EventBooking) {
  const costs = netProfitCostUsd(
    eventCostUsd(event),
    booking.passThroughBilledUsd,
    eventPassThroughCostUsd(event.bandsCostUsd ?? 0, event.externalRentalsCostUsd ?? 0),
  );
  return { costUsd: costs, netProfitUsd: booking.earnedRevenueUsd - costs };
}

export function roundUsd(value: number) {
  return Number(value.toFixed(2));
}
