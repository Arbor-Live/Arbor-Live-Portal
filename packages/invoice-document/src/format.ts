import type { GroupedInvoiceSections, InvoiceDocumentData, InvoiceLineItem } from "./types";

export function currency(value: number) {
  return `$${value.toFixed(2)}`;
}

export function groupInvoiceSections(lineItems: InvoiceLineItem[]): GroupedInvoiceSections {
  return {
    equipment: lineItems.filter(
      (line) => line.section === "equipment_package" || line.section === "equipment_type",
    ),
    external: lineItems.filter((line) => line.section === "external_rental"),
    artists: lineItems.filter((line) => line.section === "artist"),
    crew: lineItems.filter((line) => line.section === "crew"),
    fees: lineItems.filter((line) => line.section === "fee"),
  };
}

export function buildInvoiceDocumentData(args: {
  invoice: InvoiceDocumentData["invoice"];
  lineItems: Array<Omit<InvoiceLineItem, "id"> & { id?: string }>;
}): InvoiceDocumentData {
  return {
    invoice: args.invoice,
    lineItems: args.lineItems.map((line, index) => ({
      id: line.id ?? `${line.section}-${index}`,
      section: line.section,
      provider: line.provider,
      label: line.label,
      quantity: line.quantity,
      rateUsd: line.rateUsd,
      amountUsd: line.amountUsd,
    })),
  };
}
