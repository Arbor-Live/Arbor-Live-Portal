import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import {
  recomputeInvoiceTotalsFromDocumentLines,
  toDocumentLineItem,
} from "./invoiceDocumentBuild";

function equipmentLine(
  overrides: Partial<Doc<"invoiceLineItems">> & Pick<Doc<"invoiceLineItems">, "quantity" | "rateUsd">,
): Doc<"invoiceLineItems"> {
  return {
    _id: "line1" as Id<"invoiceLineItems">,
    _creationTime: 0,
    invoiceId: "inv1" as Id<"invoices">,
    section: "equipment_type",
    order: 0,
    label: "Speaker",
    createdAt: 0,
    updatedAt: 0,
    amountUsd: overrides.amountUsd ?? overrides.quantity * overrides.rateUsd,
    ...overrides,
  };
}

describe("toDocumentLineItem equipment billing", () => {
  it("multiplies per-occurrence quantity and amount by billable days", () => {
    const row = equipmentLine({
      quantity: 2,
      rateUsd: 10,
      amountUsd: 20,
      equipmentQuantityBasis: "per_occurrence",
    });

    const doc = toDocumentLineItem(row, 3);

    expect(doc.quantity).toBe(6);
    expect(doc.amountUsd).toBe(60);
    expect(doc.quantityDetail).toBe("2 per occurrence × 3");
  });

  it("keeps total-basis quantity and amount unchanged", () => {
    const row = equipmentLine({
      quantity: 6,
      rateUsd: 10,
      amountUsd: 60,
      equipmentQuantityBasis: "total",
    });

    const doc = toDocumentLineItem(row, 3);

    expect(doc.quantity).toBe(6);
    expect(doc.amountUsd).toBe(60);
  });
});

describe("recomputeInvoiceTotalsFromDocumentLines", () => {
  it("sums display line amounts into section subtotals", () => {
    const lines = [
      toDocumentLineItem(
        equipmentLine({
          quantity: 2,
          rateUsd: 10,
          amountUsd: 20,
          equipmentQuantityBasis: "per_occurrence",
        }),
        3,
      ),
      toDocumentLineItem(
        {
          ...equipmentLine({ quantity: 1, rateUsd: 50, amountUsd: 50 }),
          section: "crew",
        },
        3,
      ),
    ];

    const totals = recomputeInvoiceTotalsFromDocumentLines(lines, {
      discountType: "amount",
      discountValue: 10,
    });

    expect(totals.equipmentSubtotalUsd).toBe(60);
    expect(totals.crewSubtotalUsd).toBe(50);
    expect(totals.subtotalUsd).toBe(110);
    expect(totals.discountAmountUsd).toBe(10);
    expect(totals.totalUsd).toBe(100);
  });
});
