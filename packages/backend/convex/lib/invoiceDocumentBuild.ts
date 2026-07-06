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
  }

  return {
    id: row._id,
    section: row.section,
    provider: row.provider,
    label: row.label,
    quantity: billingQuantity,
    quantityDetail,
    rateUsd: row.rateUsd,
    amountUsd: row.amountUsd,
  };
}

export async function buildInvoiceDocumentData(
  ctx: QueryCtx | MutationCtx,
  invoice: Doc<"invoices">,
  lineItems: Doc<"invoiceLineItems">[],
  digitalQuoteUrl?: string,
): Promise<InvoiceDocumentData> {
  const billableOccurrenceCount = await resolveBillableOccurrenceCount(ctx, invoice._id);
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
    lineItems: lineItems.map((row) => toDocumentLineItem(row, billableOccurrenceCount)),
  };
}
