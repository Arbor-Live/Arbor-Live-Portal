import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { isRecurringGroup } from "./eventGroupKind";
import { listEventsByInvoiceId } from "./invoiceEvents";

export type EquipmentQuantityBasis = "total" | "per_occurrence";

export function isEquipmentSection(section: string) {
  return section === "equipment_package" || section === "equipment_type";
}

/**
 * The recurring series billed by this invoice. A multi-day booking's group also
 * points at its invoice, but bills day by day like any linked days, so it is
 * not a "series invoice" here.
 */
export async function findSeriesByInvoiceId(
  ctx: QueryCtx | MutationCtx,
  invoiceId: Id<"invoices">,
): Promise<Doc<"eventSeries"> | null> {
  const rows = await ctx.db
    .query("eventSeries")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(5);
  return rows.find((row) => isRecurringGroup(row)) ?? null;
}

/** The one recurring series every linked day belongs to, if any. */
async function inferRecurringSeriesFromDays(
  ctx: QueryCtx | MutationCtx,
  linkedEvents: Doc<"events">[],
): Promise<Doc<"eventSeries"> | null> {
  const seriesIds = new Set(
    linkedEvents.map((row) => row.seriesId).filter((id): id is Id<"eventSeries"> => Boolean(id)),
  );
  if (seriesIds.size !== 1) return null;
  const seriesDoc = await ctx.db.get([...seriesIds][0]!);
  return seriesDoc && isRecurringGroup(seriesDoc) ? seriesDoc : null;
}

export async function resolveBillableOccurrenceCount(
  ctx: QueryCtx | MutationCtx,
  invoiceId: Id<"invoices">,
): Promise<number> {
  const series = await findSeriesByInvoiceId(ctx, invoiceId);
  if (series) {
    const occurrences = await ctx.db
      .query("events")
      .withIndex("by_seriesId_and_occurrenceIndex", (q) => q.eq("seriesId", series._id))
      .take(200);
    const billable = occurrences.filter(
      (row) => !row.seriesDetached && row.status !== "cancelled",
    );
    if (billable.length > 0) return billable.length;
    return series.occurrenceCount ?? occurrences.length;
  }

  const linkedEvents = await listEventsByInvoiceId(ctx, invoiceId);
  const seriesDoc = await inferRecurringSeriesFromDays(ctx, linkedEvents);
  if (seriesDoc) {
    const billable = linkedEvents.filter(
      (row) => row.seriesId === seriesDoc._id && !row.seriesDetached && row.status !== "cancelled",
    );
    if (billable.length > 0) return billable.length;
    return seriesDoc.occurrenceCount ?? linkedEvents.length;
  }

  return linkedEvents.filter((row) => row.status !== "cancelled").length;
}

export function billingQuantityForEquipmentLine(
  quantity: number,
  basis: EquipmentQuantityBasis | undefined,
  billableOccurrenceCount: number,
) {
  if (basis !== "per_occurrence" || billableOccurrenceCount <= 0) {
    return quantity;
  }
  return quantity * billableOccurrenceCount;
}

export function perOccurrencePullQuantity(
  quantity: number,
  basis: EquipmentQuantityBasis | undefined,
  billableOccurrenceCount: number,
): { qty: number; remainder: number } {
  if (basis === "per_occurrence" || billableOccurrenceCount <= 0) {
    return { qty: quantity, remainder: 0 };
  }
  const qty = Math.floor(quantity / billableOccurrenceCount);
  const remainder = quantity % billableOccurrenceCount;
  return { qty, remainder };
}

export async function resolveSeriesMetadataForInvoice(
  ctx: QueryCtx | MutationCtx,
  invoiceId: Id<"invoices">,
) {
  const series = await findSeriesByInvoiceId(ctx, invoiceId);
  if (series) {
    const occurrences = await ctx.db
      .query("events")
      .withIndex("by_seriesId_and_occurrenceIndex", (q) => q.eq("seriesId", series._id))
      .take(200);
    const billableCount = occurrences.filter(
      (row) => !row.seriesDetached && row.status !== "cancelled",
    ).length;
    return {
      seriesId: series._id,
      title: series.title,
      occurrenceCount: series.occurrenceCount ?? occurrences.length,
      activeOccurrenceCount: billableCount,
    };
  }

  const linkedEvents = await listEventsByInvoiceId(ctx, invoiceId);
  const seriesDoc = await inferRecurringSeriesFromDays(ctx, linkedEvents);
  if (!seriesDoc) return null;
  const seriesId = seriesDoc._id;
  const billableCount = linkedEvents.filter(
    (row) => row.seriesId === seriesId && !row.seriesDetached && row.status !== "cancelled",
  ).length;
  return {
    seriesId,
    title: seriesDoc.title,
    occurrenceCount: seriesDoc.occurrenceCount ?? linkedEvents.length,
    activeOccurrenceCount: billableCount,
  };
}
