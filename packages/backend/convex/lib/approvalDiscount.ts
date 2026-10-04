/**
 * The amount discount that brings a changed quote back to what the client
 * approved (the "discount to match the approval" choice on an approved quote).
 *
 * - `raise`: the total went up. The discount grows to cover everything above
 *   the approved total. Only ever an explicit choice in the editor.
 * - `lower`: the total went down and the quote already has a discount (e.g.
 *   final crew came in cheaper). The discount shrinks so the client still pays
 *   the approved total. It never grows past the discount the quote already
 *   has, and never goes below zero: if the drop is bigger than the discount,
 *   the discount goes to zero and the total stays below the approved one
 *   (`reachesApproved` is false).
 *
 * Null when the total already matches, or it went down with no discount to
 * lower.
 */
export type ApprovalDiscountMatch = {
  kind: "raise" | "lower";
  /** The discount the quote has now, in dollars (a percent discount resolved). */
  fromUsd: number;
  /** The amount discount that matches the approval. */
  toUsd: number;
  /** The total with `toUsd` applied. */
  totalUsd: number;
  /** Whether `totalUsd` equals the approved total. */
  reachesApproved: boolean;
};

const CENT = 0.005;

function roundUsd(value: number) {
  return Number(value.toFixed(2));
}

export function matchDiscountToApproval(input: {
  /** Pre-discount total of the changed quote. */
  subtotalUsd: number;
  /** Its current discount in dollars. */
  discountAmountUsd: number;
  /** What the client approved. */
  approvedTotalUsd: number;
}): ApprovalDiscountMatch | null {
  const subtotalUsd = roundUsd(Math.max(0, input.subtotalUsd));
  const fromUsd = roundUsd(Math.max(0, input.discountAmountUsd));
  const approvedTotalUsd = roundUsd(Math.max(0, input.approvedTotalUsd));
  const totalUsd = roundUsd(Math.max(0, subtotalUsd - fromUsd));
  const delta = totalUsd - approvedTotalUsd;
  if (Math.abs(delta) < CENT) return null;

  if (delta > 0) {
    const toUsd = roundUsd(Math.max(0, subtotalUsd - approvedTotalUsd));
    return { kind: "raise", fromUsd, toUsd, totalUsd: approvedTotalUsd, reachesApproved: true };
  }

  if (fromUsd < CENT) return null;
  const toUsd = roundUsd(Math.min(fromUsd, Math.max(0, subtotalUsd - approvedTotalUsd)));
  const matchedTotalUsd = roundUsd(Math.max(0, subtotalUsd - toUsd));
  return {
    kind: "lower",
    fromUsd,
    toUsd,
    totalUsd: matchedTotalUsd,
    reachesApproved: Math.abs(matchedTotalUsd - approvedTotalUsd) < CENT,
  };
}
