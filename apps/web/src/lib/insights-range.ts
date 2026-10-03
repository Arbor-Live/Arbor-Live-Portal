import {
  endOfLocalDay,
  parseLocalDateInput,
  startOfLocalDay,
  toLocalDateInput,
} from "@/lib/crew-availability";
import { addPacificCalendarDays, pacificDateKey, pacificStartOfDayMs } from "@/lib/format";

export const INSIGHTS_RANGE_PRESETS = [
  { id: "30d", label: "30 days" },
  { id: "90d", label: "90 days" },
  { id: "12m", label: "12 months" },
  { id: "ytd", label: "Year to date" },
] as const;

export type InsightsRangePreset = (typeof INSIGHTS_RANGE_PRESETS)[number]["id"];
export const DEFAULT_INSIGHTS_RANGE: InsightsRangePreset = "12m";

/** Trailing 12 Pacific calendar months ending today. */
export function getDefaultInsightsDateInputs() {
  return insightsPresetDateInputs(DEFAULT_INSIGHTS_RANGE);
}

/** From / To day keys for a preset, ending today (Pacific). */
export function insightsPresetDateInputs(preset: InsightsRangePreset, nowMs: number = Date.now()) {
  const endDate = toLocalDateInput(endOfLocalDay(nowMs));
  const [year, month] = pacificDateKey(nowMs).split("-").map(Number);
  switch (preset) {
    case "30d":
    case "90d": {
      const days = preset === "30d" ? 29 : 89;
      return { startDate: pacificDateKey(addPacificCalendarDays(nowMs, -days)), endDate };
    }
    case "ytd":
      return { startDate: toLocalDateInput(pacificStartOfDayMs(year!, 1, 1)), endDate };
    case "12m": {
      let startYear = year!;
      let startMonth = month! - 11;
      while (startMonth < 1) {
        startMonth += 12;
        startYear -= 1;
      }
      return { startDate: toLocalDateInput(pacificStartOfDayMs(startYear, startMonth, 1)), endDate };
    }
  }
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
 * No params means the default (12 months).
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
