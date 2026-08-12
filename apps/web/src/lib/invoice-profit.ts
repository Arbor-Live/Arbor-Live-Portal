/**
 * Artist / band money is an Arbor expense, not earned revenue.
 * Keep in sync with `packages/backend/convex/lib/invoiceProfit.ts`.
 */
export function arborEarnedRevenueUsd(totalUsd: number, artistsSubtotalUsd: number) {
  return Number(Math.max(0, totalUsd - Math.max(0, artistsSubtotalUsd)).toFixed(2));
}

export function netProfitFromInvoiceUsd(
  totalUsd: number,
  artistsSubtotalUsd: number,
  eventCostsUsd: number,
) {
  return arborEarnedRevenueUsd(totalUsd, artistsSubtotalUsd) - eventCostsUsd;
}
