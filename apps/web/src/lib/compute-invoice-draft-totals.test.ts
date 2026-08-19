import { describe, expect, it } from "vitest";
import { computeInvoiceDraftTotals } from "./compute-invoice-draft-totals";

describe("computeInvoiceDraftTotals equipment", () => {
  it("bills per-occurrence equipment across linked days", () => {
    const totals = computeInvoiceDraftTotals({
      equipmentPricingMode: "nonSubsidized",
      discountType: "amount",
      discountValue: 0,
      billableOccurrenceCount: 3,
      packages: [],
      types: [
        {
          _id: "type1",
          nonSubsidizedRentalPriceUsd: 10,
        },
      ],
      lineItems: [
        {
          section: "equipment_type",
          quantity: 2,
          rateUsd: 0,
          typeId: "type1",
          equipmentQuantityBasis: "per_occurrence",
        },
      ],
    });

    expect(totals.equipmentSubtotalUsd).toBe(60);
  });

  it("uses linked day count when billableOccurrenceCount is set without a series", () => {
    const totals = computeInvoiceDraftTotals({
      equipmentPricingMode: "nonSubsidized",
      discountType: "amount",
      discountValue: 0,
      billableOccurrenceCount: 2,
      packages: [],
      types: [
        {
          _id: "type1",
          nonSubsidizedRentalPriceUsd: 25,
        },
      ],
      lineItems: [
        {
          section: "equipment_type",
          quantity: 1,
          rateUsd: 0,
          typeId: "type1",
          equipmentQuantityBasis: "per_occurrence",
        },
      ],
    });

    expect(totals.equipmentSubtotalUsd).toBe(50);
  });

  it("allows negative external rental lines for pass-through discounts", () => {
    const totals = computeInvoiceDraftTotals({
      equipmentPricingMode: "nonSubsidized",
      discountType: "amount",
      discountValue: 0,
      billableOccurrenceCount: 1,
      packages: [],
      types: [],
      lineItems: [
        {
          section: "external_rental",
          quantity: 1,
          rateUsd: 500,
        },
        {
          section: "external_rental",
          quantity: -1,
          rateUsd: 100,
        },
      ],
    });

    expect(totals.externalRentalsSubtotalUsd).toBe(400);
    expect(totals.subtotalUsd).toBe(400);
  });
});
