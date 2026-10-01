/** A quote line as the client sees it (see `invoiceRevisions.lines`). */
export type QuoteLine = {
  section: string;
  label: string;
  quantity: number;
  quantityDetail?: string;
  rateUsd: number;
  amountUsd: number;
};

export type QuoteLineChange =
  | { kind: "added"; section: string; after: QuoteLine }
  | { kind: "removed"; section: string; before: QuoteLine }
  | { kind: "changed"; section: string; before: QuoteLine; after: QuoteLine };

const SECTION_ORDER = ["equipment_package", "equipment_type", "external_rental", "artist", "crew", "fee"];

export const QUOTE_SECTION_LABELS: Record<string, string> = {
  equipment_package: "Equipment",
  equipment_type: "Equipment",
  external_rental: "External rentals",
  artist: "Artists",
  crew: "Crew",
  fee: "Fees",
};

/**
 * Lines match on section + label (the nth "Stage crew" matches the nth), so a
 * repriced line reads as changed rather than removed and re-added. Grouped
 * in quote section order.
 */
export function diffQuoteLines(before: QuoteLine[], after: QuoteLine[]): QuoteLineChange[] {
  const keyed = (lines: QuoteLine[]) => {
    const seen = new Map<string, number>();
    return lines.map((line) => {
      const base = `${line.section}|${line.label.trim().toLowerCase()}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      return { key: `${base}|${n}`, line };
    });
  };
  const beforeByKey = new Map(keyed(before).map((row) => [row.key, row.line]));
  const changes: QuoteLineChange[] = [];
  for (const { key, line } of keyed(after)) {
    const previous = beforeByKey.get(key);
    beforeByKey.delete(key);
    if (!previous) {
      changes.push({ kind: "added", section: line.section, after: line });
    } else if (
      previous.quantity !== line.quantity ||
      Math.abs(previous.rateUsd - line.rateUsd) >= 0.005 ||
      Math.abs(previous.amountUsd - line.amountUsd) >= 0.005
    ) {
      changes.push({ kind: "changed", section: line.section, before: previous, after: line });
    }
  }
  for (const line of beforeByKey.values()) {
    changes.push({ kind: "removed", section: line.section, before: line });
  }
  const rank = (section: string) => {
    const index = SECTION_ORDER.indexOf(section);
    return index === -1 ? SECTION_ORDER.length : index;
  };
  return changes.sort((a, b) => rank(a.section) - rank(b.section));
}

/** "+$250.00" / "−$80.00" / "No change". */
export function formatUsdDelta(delta: number, formatUsd: (value: number) => string) {
  if (Math.abs(delta) < 0.005) return "No change";
  return `${delta > 0 ? "+" : "−"}${formatUsd(Math.abs(delta))}`;
}
