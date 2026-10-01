import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { recomputeInvoiceTotalsFromDocumentLines, toDocumentLineItem } from "./invoiceDocumentBuild";
import { resolveBillableOccurrenceCount } from "./invoiceSeries";

export type InvoiceRevisionKind = Doc<"invoiceRevisions">["kind"];

/** A quote as the client sees it: display quantities and amounts, and its totals. */
export type InvoiceSnapshot = Pick<
  Doc<"invoiceRevisions">,
  "totalUsd" | "subtotalUsd" | "discountAmountUsd" | "lines"
>;

/** The line fields `toDocumentLineItem` reads, so unsaved rows can be priced the same way. */
export type SnapshotSourceRow = Pick<
  Doc<"invoiceLineItems">,
  | "section"
  | "label"
  | "provider"
  | "quantity"
  | "rateUsd"
  | "amountUsd"
  | "equipmentQuantityBasis"
  | "memberCount"
  | "performanceHours"
  | "packageOriginalRateUsd"
  | "packageExclusionDiscountUsd"
>;

/**
 * Price rows the way the client portal and the PDF do (series quantities,
 * crew labels), so a snapshot's amounts match what the client saw.
 */
export function snapshotFromRows(
  rows: SnapshotSourceRow[],
  billableOccurrenceCount: number,
  discount: { discountType: "amount" | "percent"; discountValue: number },
): InvoiceSnapshot {
  const documentLines = rows.map((row) =>
    toDocumentLineItem(row as Doc<"invoiceLineItems">, billableOccurrenceCount),
  );
  const totals = recomputeInvoiceTotalsFromDocumentLines(documentLines, discount);
  return {
    totalUsd: totals.totalUsd,
    subtotalUsd: totals.subtotalUsd,
    discountAmountUsd: totals.discountAmountUsd,
    lines: documentLines.map((line) => ({
      section: line.section,
      label: line.label,
      quantity: line.quantity,
      ...(line.quantityDetail ? { quantityDetail: line.quantityDetail } : {}),
      rateUsd: line.rateUsd,
      amountUsd: line.amountUsd,
    })),
  };
}

/** The invoice as currently saved. */
export async function snapshotInvoice(
  ctx: QueryCtx | MutationCtx,
  invoice: Doc<"invoices">,
): Promise<InvoiceSnapshot> {
  const rows = await ctx.db
    .query("invoiceLineItems")
    .withIndex("by_invoiceId_and_order", (q) => q.eq("invoiceId", invoice._id))
    .take(500);
  const billableOccurrenceCount = await resolveBillableOccurrenceCount(ctx, invoice._id);
  return snapshotFromRows(rows, billableOccurrenceCount, {
    discountType: invoice.discountType,
    discountValue: invoice.discountValue,
  });
}

export async function recordInvoiceRevision(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  snapshot: InvoiceSnapshot,
  details: {
    kind: InvoiceRevisionKind;
    at: number;
    note?: string;
    actorName?: string;
    actorUserId?: string;
    recordedLate?: boolean;
  },
) {
  const last = await ctx.db
    .query("invoiceRevisions")
    .withIndex("by_invoiceId_and_number", (q) => q.eq("invoiceId", invoiceId))
    .order("desc")
    .first();
  const number = (last?.number ?? 0) + 1;
  const note = details.note?.trim();
  const revisionId = await ctx.db.insert("invoiceRevisions", {
    invoiceId,
    number,
    kind: details.kind,
    ...snapshot,
    ...(note ? { note } : {}),
    ...(details.actorName ? { actorName: details.actorName } : {}),
    ...(details.actorUserId ? { actorUserId: details.actorUserId } : {}),
    ...(details.recordedLate ? { recordedLate: true } : {}),
    createdAt: details.at,
  });
  return { revisionId, number };
}

/**
 * Quotes approved before revisions existed have no record of what was
 * approved. Snapshot the quote as it stands now (before a change lands), so
 * the change can be shown against something, and mark it as recorded late.
 */
export async function ensureApprovedRevision(ctx: MutationCtx, invoice: Doc<"invoices">) {
  if (invoice.approvedRevisionId) return invoice.approvedRevisionId;
  if ((invoice.clientApprovalStatus ?? "pending") !== "approved") return undefined;
  const snapshot = await snapshotInvoice(ctx, invoice);
  const { revisionId } = await recordInvoiceRevision(ctx, invoice._id, snapshot, {
    kind: "approved",
    at: invoice.approvedAt ?? Date.now(),
    actorName: invoice.clientApprovalSignedName,
    recordedLate: true,
  });
  await ctx.db.patch(invoice._id, {
    approvedRevisionId: revisionId,
    approvedTotalUsd: snapshot.totalUsd,
  });
  return revisionId;
}

/** Newest first. An invoice changes a handful of times, so 50 is plenty. */
export async function listInvoiceRevisions(ctx: QueryCtx | MutationCtx, invoiceId: Id<"invoices">) {
  return await ctx.db
    .query("invoiceRevisions")
    .withIndex("by_invoiceId_and_number", (q) => q.eq("invoiceId", invoiceId))
    .order("desc")
    .take(50);
}
