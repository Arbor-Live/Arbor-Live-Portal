/**
 * Artist / band money is an Arbor expense, not earned revenue.
 * Keep in sync with `packages/backend/convex/lib/invoiceProfit.ts`.
 *
 * Net profit uses invoice total − event costs (bands live in costs). Do not also
 * strip artist lines from the total — that double-counts band money.
 */
export function arborEarnedRevenueUsd(totalUsd: number, artistsSubtotalUsd: number) {
  return Number(Math.max(0, totalUsd - Math.max(0, artistsSubtotalUsd)).toFixed(2));
}

export function netProfitFromInvoiceUsd(totalUsd: number, eventCostsUsd: number) {
  return totalUsd - eventCostsUsd;
}
