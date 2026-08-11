/**
 * Artist / band money is an Arbor expense, not earned revenue.
 * Invoice "artist" lines may still appear on quotes for transparency, but
 * margin and analytics treat them as non-revenue so they cannot inflate profit.
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
