/**
 * Artist / band money is an Arbor expense, not earned revenue.
 * Invoice "artist" lines may still appear on quotes for transparency (pass-through
 * billing), but Insights revenue metrics exclude them via `arborEarnedRevenueUsd`.
 *
 * Net profit must NOT also strip artists from the invoice total: event costs already
 * include `bandsCostUsd`. Subtracting both double-counts bands and understates profit.
 * Use invoice total − event costs so pass-through nets correctly and any artists vs
 * payout gap shows up as real margin/loss.
 */
export function arborEarnedRevenueUsd(totalUsd: number, artistsSubtotalUsd: number) {
  return Number(Math.max(0, totalUsd - Math.max(0, artistsSubtotalUsd)).toFixed(2));
}

export function netProfitFromInvoiceUsd(totalUsd: number, eventCostsUsd: number) {
  return totalUsd - eventCostsUsd;
}
