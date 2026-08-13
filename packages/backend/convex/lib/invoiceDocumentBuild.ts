import type { Doc } from "../_generated/dataModel";
import type { InvoiceDocumentData } from "@arbor/invoice-document/types";
import {
  billingQuantityForEquipmentLine,
  isEquipmentSection,
  perOccurrencePullQuantity,
  resolveBillableOccurrenceCount,
} from "./invoiceSeries";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export function toDocumentLineItem(
  row: Doc<"invoiceLineItems">,
  billableOccurrenceCount: number,
  packageExclusionLabels?: string[],
) {
  const basis = row.equipmentQuantityBasis;
  const isEquipment = isEquipmentSection(row.section);
  const billingQuantity = isEquipment
    ? billingQuantityForEquipmentLine(row.quantity, basis, billableOccurrenceCount)
    : row.quantity;

  let quantityDetail: string | undefined;
  if (isEquipment && basis === "per_occurrence" && billableOccurrenceCount > 1) {
    quantityDetail = `${row.quantity} per occurrence × ${billableOccurrenceCount}`;
  } else if (isEquipment && basis !== "per_occurrence" && billableOccurrenceCount > 1) {
    const { qty, remainder } = perOccurrencePullQuantity(
      row.quantity,
      basis,
      billableOccurrenceCount,
    );
    quantityDetail =
      remainder > 0
        ? `~${qty} per occurrence (${remainder} remainder)`
        : `~${qty} per occurrence`;
  } else if (
    row.section === "artist" &&
    row.memberCount !== undefined &&
    row.memberCount > 0 &&
    row.performanceHours !== undefined &&
    row.performanceHours > 0
  ) {
    const peopleLabel = row.memberCount === 1 ? "1 person" : `${row.memberCount} people`;
    const hoursLabel =
      row.performanceHours === 1 ? "1 hr" : `${row.performanceHours} hrs`;
    quantityDetail = `${peopleLabel} × ${hoursLabel}`;
  }

  let detailNote: string | undefined;
  if (
    row.section === "equipment_package" &&
    (row.packageOriginalRateUsd != null ||
      row.packageExclusionDiscountUsd != null ||
      (packageExclusionLabels && packageExclusionLabels.length > 0))
  ) {
    const parts: string[] = [];
    if (row.packageOriginalRateUsd != null) {
      parts.push(`Package price $${row.packageOriginalRateUsd.toFixed(2)}`);
    }
    if (packageExclusionLabels?.length) {
      parts.push(`Removed: ${packageExclusionLabels.join(", ")}`);
    }
    if (row.packageExclusionDiscountUsd != null && row.packageExclusionDiscountUsd > 0) {
      parts.push(`Exclusion discount −$${row.packageExclusionDiscountUsd.toFixed(2)}`);
    }
    detailNote = parts.join(" · ");
  }

  return {
    id: row._id,
    section: row.section,
    provider: row.provider,
    label: row.label,
    detailNote,
    quantity: billingQuantity,
    quantityDetail,
    rateUsd: row.rateUsd,
    amountUsd: row.amountUsd,
    memberCount:
      row.section === "artist" && row.memberCount !== undefined && row.memberCount > 0
        ? row.memberCount
        : undefined,
    performanceHours:
      row.section === "artist" &&
      row.performanceHours !== undefined &&
      row.performanceHours > 0
        ? row.performanceHours
        : undefined,
  };
}

export async function buildInvoiceDocumentData(
  ctx: QueryCtx | MutationCtx,
  invoice: Doc<"invoices">,
  lineItems: Doc<"invoiceLineItems">[],
  digitalQuoteUrl?: string,
): Promise<InvoiceDocumentData> {
  const billableOccurrenceCount = await resolveBillableOccurrenceCount(ctx, invoice._id);
  const excludedTypeIds = Array.from(
    new Set(lineItems.flatMap((row) => row.excludedTypeIds ?? [])),
  );
  const excludedTypes = await Promise.all(excludedTypeIds.map((id) => ctx.db.get(id)));
  const excludedLabelById = new Map(
    excludedTypeIds.map((id, index) => {
      const type = excludedTypes[index];
      const label = type
        ? `${type.name}${type.model ? ` · ${type.model}` : ""}`
        : String(id);
      return [id, label] as const;
    }),
  );

  return {
    invoice: {
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      managerName: invoice.managerName,
      managerEmail: invoice.managerEmail,
      clientGroupName: invoice.clientGroupName,
      clientContactName: invoice.clientContactName,
      clientEmail: invoice.clientEmail,
      clientPhone: invoice.clientPhone,
      clientApprovalStatus: invoice.clientApprovalStatus,
      digitalQuoteUrl,
      equipmentSubtotalUsd: invoice.equipmentSubtotalUsd,
      externalRentalsSubtotalUsd: invoice.externalRentalsSubtotalUsd,
      artistsSubtotalUsd: invoice.artistsSubtotalUsd,
      crewSubtotalUsd: invoice.crewSubtotalUsd,
      feesSubtotalUsd: invoice.feesSubtotalUsd,
      subtotalUsd: invoice.subtotalUsd,
      discountAmountUsd: invoice.discountAmountUsd,
      totalUsd: invoice.totalUsd,
      notes: invoice.notes,
    },
    lineItems: lineItems.map((row) =>
      toDocumentLineItem(
        row,
        billableOccurrenceCount,
        row.excludedTypeIds?.map((id) => excludedLabelById.get(id) ?? String(id)),
      ),
    ),
  };
}
