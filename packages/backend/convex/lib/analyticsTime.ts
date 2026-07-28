import { pacificDateKey, pacificEndOfDayMs, pacificStartOfDayMs } from "@arbor/format";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Pacific calendar month key `YYYY-MM`. */
export function pacificMonthKey(ms: number): string {
  return pacificDateKey(ms).slice(0, 7);
}

export function msToDays(ms: number): number {
  return ms / DAY_MS;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/** Inclusive list of Pacific `YYYY-MM` keys covering [startMs, endMs]. */
export function listPacificMonthKeys(startMs: number, endMs: number): string[] {
  if (endMs < startMs) return [];
  const keys: string[] = [];
  let [year, month] = pacificDateKey(startMs).split("-").map(Number) as [number, number];
  const endKey = pacificMonthKey(endMs);

  for (let i = 0; i < 240; i += 1) {
    const key = `${year}-${String(month).padStart(2, "0")}`;
    keys.push(key);
    if (key >= endKey) break;
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

/** First instant of a Pacific calendar month (`YYYY-MM`). */
export function pacificMonthStartMs(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  return pacificStartOfDayMs(year!, month!, 1);
}

/** Last instant of a Pacific calendar month (`YYYY-MM`). */
export function pacificMonthEndMs(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year!, month!, 0)).getUTCDate();
  return pacificEndOfDayMs(year!, month!, lastDay);
}
