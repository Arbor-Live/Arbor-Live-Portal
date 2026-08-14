import { describe, expect, it } from "vitest";
import { arborEarnedRevenueUsd, netProfitFromInvoiceUsd } from "./invoiceProfit";

describe("invoiceProfit", () => {
  it("excludes artist lines from earned revenue metrics", () => {
    expect(arborEarnedRevenueUsd(1000, 200)).toBe(800);
    expect(arborEarnedRevenueUsd(200, 200)).toBe(0);
  });

  it("does not double-count bands when computing net profit", () => {
    // $1000 billed incl $300 artists; $500 event cost (incl $300 bands) → $500 profit
    // (not $200 — stripping artists from revenue while keeping bands in cost was wrong)
    expect(netProfitFromInvoiceUsd(1000, 500)).toBe(500);
  });
});
