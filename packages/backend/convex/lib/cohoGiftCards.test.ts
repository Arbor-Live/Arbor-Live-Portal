import { describe, expect, it } from "vitest";
import { pickBestCohoGiftCard } from "./cohoGiftCards";

describe("pickBestCohoGiftCard", () => {
  it("returns the card with the highest balance", () => {
    const best = pickBestCohoGiftCard([
      { cardNumber: "111", balanceUsd: 40 },
      { cardNumber: "222", balanceUsd: 120 },
      { cardNumber: "333", balanceUsd: 80 },
    ]);
    expect(best?.cardNumber).toBe("222");
  });

  it("ignores cards without a number", () => {
    const best = pickBestCohoGiftCard([
      { cardNumber: undefined, balanceUsd: 999 },
      { cardNumber: "222", balanceUsd: 10 },
    ]);
    expect(best?.cardNumber).toBe("222");
  });

  it("treats an unknown balance as zero", () => {
    const best = pickBestCohoGiftCard([
      { cardNumber: "111", balanceUsd: undefined },
      { cardNumber: "222", balanceUsd: 5 },
    ]);
    expect(best?.cardNumber).toBe("222");
  });

  it("returns null when no card has a number", () => {
    expect(pickBestCohoGiftCard([{ cardNumber: undefined, balanceUsd: 10 }])).toBeNull();
    expect(pickBestCohoGiftCard([])).toBeNull();
  });
});
