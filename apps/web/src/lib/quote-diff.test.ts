import { describe, expect, it } from "vitest";
import { diffQuoteLines, formatUsdDelta, type QuoteLine } from "./quote-diff";

const line = (section: string, label: string, amountUsd: number, quantity = 1): QuoteLine => ({
  section,
  label,
  quantity,
  rateUsd: amountUsd / quantity,
  amountUsd,
});

describe("diffQuoteLines", () => {
  it("reports added, removed and repriced lines in quote section order", () => {
    const before = [line("crew", "Stage crew", 200, 2), line("fee", "Venue fee", 50), line("artist", "The Larks", 300)];
    const after = [line("fee", "Venue fee", 50), line("crew", "Stage crew", 300, 3), line("equipment_type", "Mic", 20)];
    expect(diffQuoteLines(before, after).map((change) => [change.kind, change.section])).toEqual([
      ["added", "equipment_type"],
      ["removed", "artist"],
      ["changed", "crew"],
    ]);
  });

  it("matches repeated labels in order, and ignores unchanged lines", () => {
    const before = [line("crew", "Stage crew", 100), line("crew", "Stage crew", 100)];
    const after = [line("crew", "Stage crew", 100), line("crew", "stage crew ", 150)];
    const changes = diffQuoteLines(before, after);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "changed", before: { amountUsd: 100 }, after: { amountUsd: 150 } });
  });
});

describe("formatUsdDelta", () => {
  const usd = (value: number) => `$${value.toFixed(2)}`;
  it("signs the difference and calls zero no change", () => {
    expect(formatUsdDelta(250, usd)).toBe("+$250.00");
    expect(formatUsdDelta(-80, usd)).toBe("−$80.00");
    expect(formatUsdDelta(0.001, usd)).toBe("No change");
  });
});
