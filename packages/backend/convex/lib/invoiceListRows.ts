import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { listAdditionallyLinkedEventIds } from "./eventInvoiceLinks";
import { isRecurringGroup } from "./eventGroupKind";
import { listEventsByInvoiceId, mergeLinkedInvoiceEvents } from "./invoiceEvents";
import { findSeriesByInvoiceId } from "./invoiceSeries";
import { invoiceDueEndMs } from "./invoicePaymentStatus";
import { eventPassThroughCostUsd } from "./invoiceProfit";
import {
  getActivePaymentProofSubmissionForInvoice,
  getPaymentProofOpensAt,
} from "./paymentProof";

const DAY_MS = 24 * 60 * 60 * 1000;

export type InvoiceListEvent = Pick<
  Doc<"events">,
  | "_id"
  | "_creationTime"
  | "title"
  | "startAt"
  | "endAt"
  | "timezone"
  | "seriesId"
  | "invoiceId"
  | "crewCostUsd"
  | "bandsCostUsd"
  | "externalRentalsCostUsd"
  | "otherCostUsd"
>;

export type InvoiceListGroup = Pick<Doc<"eventSeries">, "title" | "kind">;

export type InvoiceListLabels = {
  seriesTitle: string | undefined;
  linkedEventTitle: string | undefined;
  eventCostsUsd: number | null;
  eventPassThroughCostsUsd: number | null;
  primaryEvent: InvoiceListEvent | undefined;
};

export type InvoiceListPaymentStatus =
  | "estimate"
  | "ready_to_finalize"
  | "payment_pending"
  | "proof_received"
  | "overdue"
  | "paid";

/** The one series id the linked days share, or null for zero or mixed ids. */
export function inferredSeriesIdForEvents(
  linkedEvents: Array<Pick<Doc<"events">, "seriesId">>,
): Id<"eventSeries"> | null {
  const seriesIds = [
    ...new Set(
      linkedEvents.map((row) => row.seriesId).filter((id): id is Id<"eventSeries"> => Boolean(id)),
    ),
  ];
  return seriesIds.length === 1 ? seriesIds[0]! : null;
}

/**
 * Series / linked-event labels for one invoice list row, joined in memory from
 * preloaded rows. `inferredSeries` is the doc behind the single shared series
 * id of the linked days; it is only consulted when no recurring series is
 * linked to the invoice directly.
 */
export function computeInvoiceListLabels(args: {
  series: InvoiceListGroup | null;
  inferredSeries: InvoiceListGroup | null;
  linkedEvents: InvoiceListEvent[];
}): InvoiceListLabels {
  const primaryEvent = args.linkedEvents[0];
  const eventCostsUsd = primaryEvent
    ? (primaryEvent.crewCostUsd ?? 0) +
      (primaryEvent.bandsCostUsd ?? 0) +
      (primaryEvent.externalRentalsCostUsd ?? 0) +
      (primaryEvent.otherCostUsd ?? 0)
    : null;
  const eventPassThroughCostsUsd = primaryEvent
    ? eventPassThroughCostUsd(
        primaryEvent.bandsCostUsd ?? 0,
        primaryEvent.externalRentalsCostUsd ?? 0,
      )
    : null;
  const seriesTitle = args.series
    ? args.series.title
    : args.inferredSeries && isRecurringGroup(args.inferredSeries)
      ? args.inferredSeries.title
      : undefined;
  return {
    seriesTitle,
    linkedEventTitle: args.linkedEvents[0]?.title,
    eventCostsUsd,
    eventPassThroughCostsUsd,
    primaryEvent,
  };
}

/**
 * Payment status for the invoice list, computed only for approved quotes:
 * `paid` once money landed on our account; while it's still an estimate,
 * `estimate` before the event ends and `ready_to_finalize` after (staff owe
 * the final invoice); then `overdue` past the due date (counting days since),
 * `proof_received` when the client submitted payment proof we haven't
 * confirmed yet, else `payment_pending`. Non-approved quotes (draft / awaiting
 * approval / changes requested) return null.
 */
export function computeInvoiceListPaymentStatus(args: {
  invoice: Pick<
    Doc<"invoices">,
    | "approvedAt"
    | "clientApprovalStatus"
    | "paymentReceivedAt"
    | "billingFinalizedAt"
    | "paymentOpenedEarlyAt"
    | "dueDate"
  >;
  primaryEvent: Pick<Doc<"events">, "endAt" | "timezone"> | undefined;
  hasActiveSubmission: boolean;
  nowMs: number;
}): { paymentStatus: InvoiceListPaymentStatus | null; daysOverdue: number } {
  const { invoice, primaryEvent, hasActiveSubmission, nowMs } = args;
  if ((invoice.clientApprovalStatus ?? "pending") !== "approved") {
    return { paymentStatus: null, daysOverdue: 0 };
  }
  if (invoice.paymentReceivedAt) {
    return { paymentStatus: "paid", daysOverdue: 0 };
  }
  if (getPaymentProofOpensAt(invoice) == null && !hasActiveSubmission) {
    const eventEnded = primaryEvent ? primaryEvent.endAt < nowMs : false;
    return { paymentStatus: eventEnded ? "ready_to_finalize" : "estimate", daysOverdue: 0 };
  }
  const dueEndMs = invoiceDueEndMs(invoice, primaryEvent?.timezone);
  if (dueEndMs != null && nowMs > dueEndMs) {
    return {
      paymentStatus: "overdue",
      daysOverdue: Math.max(0, Math.floor((nowMs - dueEndMs) / DAY_MS) + 1),
    };
  }
  return {
    paymentStatus: hasActiveSubmission ? "proof_received" : "payment_pending",
    daysOverdue: 0,
  };
}

export type InvoiceListJoin = {
  series: InvoiceListGroup | null;
  inferredSeries: InvoiceListGroup | null;
  linkedEvents: InvoiceListEvent[];
  activePaymentProof: Doc<"eventPaymentProofSubmissions"> | null;
};

export function invoiceListNeedsPaymentProof(
  invoice: Pick<Doc<"invoices">, "clientApprovalStatus" | "paymentReceivedAt">,
): boolean {
  return (invoice.clientApprovalStatus ?? "pending") === "approved" && !invoice.paymentReceivedAt;
}

/**
 * Joins for a page of invoice list rows. One indexed read per invoice id per
 * table (no index covers a set of ids at once), with event and series
 * documents deduped across invoices through a shared in-flight promise map —
 * split bills (deposit + balance on one event) then pay for one `db.get`, not
 * one per row. Event/series doc loads are phased so primary event docs seed
 * the cache before additional-link lookups run.
 */
export async function loadInvoiceListJoins(
  ctx: QueryCtx,
  invoices: Array<Pick<Doc<"invoices">, "_id" | "clientApprovalStatus" | "paymentReceivedAt">>,
): Promise<Map<Id<"invoices">, InvoiceListJoin>> {
  const eventById = new Map<Id<"events">, Promise<Doc<"events"> | null>>();
  const getEvent = (eventId: Id<"events">) => {
    const inFlight = eventById.get(eventId);
    if (inFlight) return inFlight;
    const pending = ctx.db.get(eventId);
    eventById.set(eventId, pending);
    return pending;
  };
  const seriesById = new Map<Id<"eventSeries">, Promise<Doc<"eventSeries"> | null>>();
  const getSeries = (seriesId: Id<"eventSeries">) => {
    const inFlight = seriesById.get(seriesId);
    if (inFlight) return inFlight;
    const pending = ctx.db.get(seriesId);
    seriesById.set(seriesId, pending);
    return pending;
  };

  const bases = await Promise.all(
    invoices.map(async (invoice) => {
      const [series, primaryEvents, additionalEventIds] = await Promise.all([
        findSeriesByInvoiceId(ctx, invoice._id),
        listEventsByInvoiceId(ctx, invoice._id),
        listAdditionallyLinkedEventIds(ctx, invoice._id),
      ]);
      for (const event of primaryEvents) {
        if (!eventById.has(event._id)) eventById.set(event._id, Promise.resolve(event));
      }
      return { invoice, series, primaryEvents, additionalEventIds };
    }),
  );

  const joined = await Promise.all(
    bases.map(async (base) => {
      const additional = (await Promise.all(base.additionalEventIds.map(getEvent))).filter(
        (event): event is Doc<"events"> => event !== null && event.invoiceId !== base.invoice._id,
      );
      const linkedEvents = mergeLinkedInvoiceEvents(base.primaryEvents, additional);
      let inferredSeries: Doc<"eventSeries"> | null = null;
      if (!base.series) {
        const seriesId = inferredSeriesIdForEvents(linkedEvents);
        if (seriesId) inferredSeries = await getSeries(seriesId);
      }
      return {
        invoice: base.invoice,
        join: {
          series: base.series,
          inferredSeries,
          linkedEvents,
          activePaymentProof: null,
        } satisfies InvoiceListJoin,
      };
    }),
  );

  const proofs = await Promise.all(
    joined.map(({ invoice }) =>
      invoiceListNeedsPaymentProof(invoice)
        ? getActivePaymentProofSubmissionForInvoice(ctx, invoice._id)
        : null,
    ),
  );
  return new Map(
    joined.map(({ invoice, join }, index) => [
      invoice._id,
      { ...join, activePaymentProof: proofs[index] ?? null },
    ]),
  );
}
