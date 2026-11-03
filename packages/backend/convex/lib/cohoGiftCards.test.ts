import { describe, expect, it } from "vitest";
import { isWithinCohoQrWindow, pickBestCohoGiftCard } from "./cohoGiftCards";

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

describe("isWithinCohoQrWindow", () => {
  const HOUR = 60 * 60 * 1000;
  const shift = { startsAt: 10 * HOUR, endsAt: 14 * HOUR };

  it("opens two hours before the shift starts", () => {
    expect(isWithinCohoQrWindow(shift, 8 * HOUR - 1)).toBe(false);
    expect(isWithinCohoQrWindow(shift, 8 * HOUR)).toBe(true);
  });

  it("stays open during the shift", () => {
    expect(isWithinCohoQrWindow(shift, 12 * HOUR)).toBe(true);
  });

  it("closes two hours after the shift ends", () => {
    expect(isWithinCohoQrWindow(shift, 16 * HOUR)).toBe(true);
    expect(isWithinCohoQrWindow(shift, 16 * HOUR + 1)).toBe(false);
  });

  it("opens two hours before an earlier call time", () => {
    const called = { ...shift, callTime: 9 * HOUR };
    expect(isWithinCohoQrWindow(called, 7 * HOUR)).toBe(true);
    expect(isWithinCohoQrWindow(called, 7 * HOUR - 1)).toBe(false);
  });

  it("ignores a call time after the start", () => {
    expect(isWithinCohoQrWindow({ ...shift, callTime: 11 * HOUR }, 8 * HOUR)).toBe(true);
  });
});
