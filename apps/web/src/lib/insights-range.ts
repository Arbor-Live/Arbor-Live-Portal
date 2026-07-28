import {
  endOfLocalDay,
  parseLocalDateInput,
  startOfLocalDay,
  toLocalDateInput,
} from "@/lib/crew-availability";
import { pacificDateKey, pacificStartOfDayMs } from "@/lib/format";

/** Trailing 12 Pacific calendar months ending today. */
export function getDefaultInsightsDateInputs() {
  const endMs = endOfLocalDay(Date.now());
  const [year, month] = pacificDateKey(Date.now()).split("-").map(Number);
  let startYear = year!;
  let startMonth = month! - 11;
  while (startMonth < 1) {
    startMonth += 12;
    startYear -= 1;
  }
  const startMs = pacificStartOfDayMs(startYear, startMonth, 1);
  return {
    startDate: toLocalDateInput(startMs),
    endDate: toLocalDateInput(endMs),
  };
}

export function insightsRangeFromDateInputs(startDate: string, endDate: string) {
  const start = parseLocalDateInput(startDate);
  const end = parseLocalDateInput(endDate);
  if (!start || !end) return null;
  const rangeStart = startOfLocalDay(start);
  const rangeEnd = endOfLocalDay(end);
  if (rangeEnd < rangeStart) return null;
  return { startMs: rangeStart, endMs: rangeEnd };
}
