import { describe, expect, it } from "vitest";
import {
  arborEarnedRevenueUsd,
  eventPassThroughCostUsd,
  invoicePassThroughUsd,
  netProfitCostUsd,
  netProfitFromInvoiceUsd,
} from "./invoiceProfit";

describe("invoiceProfit", () => {
  it("treats artists and external rentals as pass-through (non-earned)", () => {
    expect(invoicePassThroughUsd(200, 100)).toBe(300);
    expect(arborEarnedRevenueUsd(1000, 300)).toBe(700);
    expect(arborEarnedRevenueUsd(300, 300)).toBe(0);
  });

  it("does not double-count pass-through when event costs include bands/external", () => {
    // $1000 billed: $400 equipment+crew, $300 artists, $300 external
    // Event costs $500: $200 crew, $200 bands, $100 external
    // Earned $400; operating costs $200; net $200
    const passThrough = invoicePassThroughUsd(300, 300);
    const eventPassThrough = eventPassThroughCostUsd(200, 100);
    expect(netProfitCostUsd(500, passThrough, eventPassThrough)).toBe(200);
    expect(netProfitFromInvoiceUsd(1000, passThrough, 500, eventPassThrough)).toBe(200);
  });

  it("still charges pass-through cost overruns against profit", () => {
    // Invoice pass-through $200; event bands+external $350; other costs $100
    // Event total $450 → overrun $150 → net = (1000-200) - (450-200) = 800-250 = 550
    // equivalently total - eventCosts = 550 when overrun dominates the strip
    const passThrough = invoicePassThroughUsd(200, 0);
    const eventPassThrough = eventPassThroughCostUsd(350, 0);
    expect(netProfitFromInvoiceUsd(1000, passThrough, 450, eventPassThrough)).toBe(550);
  });

  it("treats uncosted invoice pass-through as zero-margin expense", () => {
    // $300 external on invoice, $0 event external cost, $100 crew cost
    // Must not count the $300 as profit
    const passThrough = invoicePassThroughUsd(0, 300);
    expect(netProfitFromInvoiceUsd(1000, passThrough, 100, 0)).toBe(600);
  });
});
