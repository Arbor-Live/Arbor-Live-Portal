/**
 * The card crew should pay with: the registered card with the highest known
 * balance. Cards without a card number (never fetched) are ignored; an unknown
 * balance counts as zero so a fetched card always wins.
 */
export function pickBestCohoGiftCard<
  T extends { cardNumber?: string | undefined; balanceUsd?: number | undefined },
>(cards: readonly T[]): T | null {
  const usable = cards.filter((card) => card.cardNumber);
  if (usable.length === 0) return null;
  return usable.reduce((a, b) => ((b.balanceUsd ?? 0) > (a.balanceUsd ?? 0) ? b : a));
}

/** How long before and after a shift crew can see the QR. */
export const COHO_QR_SHIFT_PADDING_MS = 2 * 60 * 60 * 1000;

/**
 * Whether `now` falls within two hours of a shift: from two hours before the
 * earlier of call time and start, until two hours after it ends.
 */
export function isWithinCohoQrWindow(
  shift: { callTime?: number | undefined; startsAt: number; endsAt: number },
  now: number,
): boolean {
  const opensAt = Math.min(shift.callTime ?? shift.startsAt, shift.startsAt);
  return (
    now >= opensAt - COHO_QR_SHIFT_PADDING_MS && now <= shift.endsAt + COHO_QR_SHIFT_PADDING_MS
  );
}
