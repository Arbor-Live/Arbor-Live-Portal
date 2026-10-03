import {
  endOfLocalDay,
  parseLocalDateInput,
  startOfLocalDay,
  toLocalDateInput,
} from "@/lib/crew-availability";
import { addPacificCalendarDays, pacificDateKey, pacificStartOfDayMs } from "@/lib/format";
import {
  academicYearPeriod,
  lastQuarterPeriod,
  thisQuarterPeriod,
  type InsightsPeriod,
} from "@/lib/insights-quarters";

/** Stanford calendar periods, then rolling windows ending today. */
export const INSIGHTS_ACADEMIC_PRESETS = [
  { id: "this-quarter", label: "This quarter" },
  { id: "last-quarter", label: "Last quarter" },
  { id: "this-year", label: "This academic year" },
  { id: "last-year", label: "Last academic year" },
] as const;

export const INSIGHTS_ROLLING_PRESETS = [
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "12m", label: "12 months" },
] as const;

export const INSIGHTS_RANGE_PRESETS = [...INSIGHTS_ACADEMIC_PRESETS, ...INSIGHTS_ROLLING_PRESETS] as const;

export type InsightsRangePreset = (typeof INSIGHTS_RANGE_PRESETS)[number]["id"];
export const DEFAULT_INSIGHTS_RANGE: InsightsRangePreset = "this-quarter";

/** Trailing 12 Pacific calendar months ending today. */
export function trailingTwelveMonthDateInputs(nowMs: number = Date.now()) {
  return insightsPresetDateInputs("12m", nowMs);
}

function academicPeriod(preset: InsightsRangePreset, todayKey: string): InsightsPeriod | null {
  switch (preset) {
    case "this-quarter":
      return thisQuarterPeriod(todayKey);
    case "last-quarter":
      return lastQuarterPeriod(todayKey);
    case "this-year":
      return academicYearPeriod(todayKey, 0);
    case "last-year":
      return academicYearPeriod(todayKey, -1);
    default:
      return null;
  }
}

/**
 * From / To day keys for a preset, plus the Stanford period's name for the
 * academic ones ("Autumn 2026"). Rolling windows end today (Pacific); a
 * Stanford period runs its full span. Outside the calendar's coverage the
 * academic presets fall back to 12 months.
 */
export function insightsPresetDateInputs(
  preset: InsightsRangePreset,
  nowMs: number = Date.now(),
): { startDate: string; endDate: string; periodLabel?: string } {
  const todayKey = pacificDateKey(nowMs);
  const period = academicPeriod(preset, todayKey);
  if (period) return { startDate: period.startDate, endDate: period.endDate, periodLabel: period.label };

  const endDate = toLocalDateInput(endOfLocalDay(nowMs));
  if (preset === "30d" || preset === "90d") {
    const days = preset === "30d" ? 29 : 89;
    return { startDate: pacificDateKey(addPacificCalendarDays(nowMs, -days)), endDate };
  }
  const [year, month] = todayKey.split("-").map(Number);
  let startYear = year!;
  let startMonth = month! - 11;
  while (startMonth < 1) {
    startMonth += 12;
    startYear -= 1;
  }
  return { startDate: toLocalDateInput(pacificStartOfDayMs(startYear, startMonth, 1)), endDate };
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

export type InsightsRangeSelection =
  | { kind: "preset"; preset: InsightsRangePreset }
  | { kind: "custom"; startDate: string; endDate: string };

/**
 * The range lives in the URL so tabs, reloads and shared links keep it:
 * `?range=90d`, or `?from=2026-01-01&to=2026-03-31` for a custom range.
 * No params means the default (this quarter).
 */
export function insightsRangeFromSearchParams(params: URLSearchParams): InsightsRangeSelection {
  const from = params.get("from");
  const to = params.get("to");
  if (from && to) return { kind: "custom", startDate: from, endDate: to };
  const preset = params.get("range");
  const known = INSIGHTS_RANGE_PRESETS.find((option) => option.id === preset);
  return { kind: "preset", preset: known?.id ?? DEFAULT_INSIGHTS_RANGE };
}

export function insightsSelectionDateInputs(selection: InsightsRangeSelection) {
  return selection.kind === "custom"
    ? { startDate: selection.startDate, endDate: selection.endDate }
    : insightsPresetDateInputs(selection.preset);
}

export function insightsSelectionToSearch(selection: InsightsRangeSelection) {
  const params = new URLSearchParams();
  if (selection.kind === "custom") {
    params.set("from", selection.startDate);
    params.set("to", selection.endDate);
  } else if (selection.preset !== DEFAULT_INSIGHTS_RANGE) {
    params.set("range", selection.preset);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
