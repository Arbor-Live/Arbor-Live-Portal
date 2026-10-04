import { describe, expect, it } from "vitest";
import { renderInvoicePdfBuffer } from "./render-pdf";
import type { InvoiceDocumentData, InvoiceLineItem } from "./types";

function crew(label: string, hours: number, rateUsd: number, extra: Partial<InvoiceLineItem> = {}): InvoiceLineItem {
  return {
    id: label,
    section: "crew",
    label,
    quantity: hours,
    rateUsd,
    amountUsd: hours * rateUsd,
    ...extra,
  };
}

const data: InvoiceDocumentData = {
  invoice: {
    invoiceNumber: "ALINV-TEST123",
    issueDate: "2026-10-04",
    managerName: "Arbor",
    equipmentSubtotalUsd: 0,
    externalRentalsSubtotalUsd: 0,
    artistsSubtotalUsd: 0,
    crewSubtotalUsd: 349.5,
    feesSubtotalUsd: 0,
    subtotalUsd: 349.5,
    discountAmountUsd: 0,
    totalUsd: 349.5,
  },
  lineItems: [
    crew("Day 1 — Load-in — Sound engineer (Ana (Lead))", 3, 35),
    crew("Day 1 — Load-in — Stagehand (Open slot)", 3, 22),
    crew("Day 2 — Show — Lighting tech (Sam)", 4.5, 25),
    crew("Extra hands", 3, 22, { memberCount: 2, performanceHours: 1.5, crewSource: "manual" }),
  ],
};

describe("InvoiceDocumentPdf crew sections", () => {
  it("renders a multi-day crew quote grouped by day and section", async () => {
    const buffer = await renderInvoicePdfBuffer(data);
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("renders a crew section too tall for one page", async () => {
    const lines = Array.from({ length: 60 }, (_, index) =>
      crew(`Load-in — Rigging assistant for the main stage truss (Crew member ${index + 1} with a long name)`, 3, 22),
    );
    const buffer = await renderInvoicePdfBuffer({ ...data, lineItems: lines });
    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
