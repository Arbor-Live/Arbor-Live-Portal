/**
 * Artists and external rentals are pass-through expenses, not Arbor margin.
 * Keep in sync with `packages/backend/convex/lib/invoiceProfit.ts`.
 */
export function invoicePassThroughUsd(
  artistsSubtotalUsd: number,
  externalRentalsSubtotalUsd: number,
) {
  return Math.max(0, artistsSubtotalUsd) + Math.max(0, externalRentalsSubtotalUsd);
}

export function eventPassThroughCostUsd(bandsCostUsd: number, externalRentalsCostUsd: number) {
  return Math.max(0, bandsCostUsd) + Math.max(0, externalRentalsCostUsd);
}

export function arborEarnedRevenueUsd(totalUsd: number, passThroughSubtotalUsd: number) {
  return Number(Math.max(0, totalUsd - Math.max(0, passThroughSubtotalUsd)).toFixed(2));
}

/** Event costs still charged against Arbor margin after removing pass-through overlap. */
export function netProfitCostUsd(
  eventCostsUsd: number,
  invoicePassThroughSubtotalUsd: number,
  eventPassThroughCostsUsd: number,
) {
  const invoicePassThrough = Math.max(0, invoicePassThroughSubtotalUsd);
  const eventPassThrough = Math.max(0, eventPassThroughCostsUsd);
  return eventCostsUsd - Math.min(eventPassThrough, invoicePassThrough);
}

export function netProfitFromInvoiceUsd(
  totalUsd: number,
  invoicePassThroughSubtotalUsd: number,
  eventCostsUsd: number,
  eventPassThroughCostsUsd: number,
) {
  return (
    arborEarnedRevenueUsd(totalUsd, invoicePassThroughSubtotalUsd) -
    netProfitCostUsd(eventCostsUsd, invoicePassThroughSubtotalUsd, eventPassThroughCostsUsd)
  );
}
