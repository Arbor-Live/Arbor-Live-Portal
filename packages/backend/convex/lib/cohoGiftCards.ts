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
