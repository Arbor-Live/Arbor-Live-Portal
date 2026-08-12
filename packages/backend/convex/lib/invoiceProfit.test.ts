import { describe, expect, it } from "vitest";
import { arborEarnedRevenueUsd, netProfitFromInvoiceUsd } from "./invoiceProfit";

describe("invoiceProfit", () => {
  it("excludes artist lines from earned revenue", () => {
    expect(arborEarnedRevenueUsd(1000, 200)).toBe(800);
    expect(arborEarnedRevenueUsd(200, 200)).toBe(0);
  });

  it("treats bands/artists as non-revenue when computing net profit", () => {
    // $1000 billed incl $300 artists, $500 event cost (incl bands) → $200 profit
    expect(netProfitFromInvoiceUsd(1000, 300, 500)).toBe(200);
  });
});
