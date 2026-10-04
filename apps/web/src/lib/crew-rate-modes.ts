import type { Tone } from "@/components/page-header";

/**
 * Crew rate modes, as stored on `userCompensationRates`. Normal and Lead hold
 * no number of their own: they resolve against the global rates at read time,
 * so a pinned person follows the globals. Custom is a fixed hourly rate.
 */
export type CrewRateMode = "normal" | "lead" | "custom";

export const CREW_RATE_MODES: CrewRateMode[] = ["normal", "lead", "custom"];

export const CREW_RATE_MODE_LABELS: Record<CrewRateMode, string> = {
  normal: "Normal",
  lead: "Lead",
  custom: "Custom",
};

export const CREW_RATE_MODE_TONES: Record<CrewRateMode, Tone> = {
  normal: "neutral",
  lead: "blue",
  custom: "neutral",
};

export type CrewRateRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  /** `null` when the person has no rate row yet; the server treats that as Custom. */
  rateMode: CrewRateMode | null;
  customHourlyRateUsd: number | null;
  /** The resolved rate: the global for Normal / Lead, the stored number for Custom. */
  hourlyRateUsd: number | null;
  payrollMethod: string;
};

export type GlobalCrewRates = { normal: number; lead: number };

/** The mode a row shows: no rate row yet reads as Custom, which is how the server treats it. */
export function crewRateMode(row: Pick<CrewRateRow, "rateMode">): CrewRateMode {
  return row.rateMode ?? "custom";
}

/** Nothing to pay: no rate set, or a rate of $0. */
export function hasNoRate(row: Pick<CrewRateRow, "hourlyRateUsd">) {
  return !(row.hourlyRateUsd !== null && row.hourlyRateUsd > 0);
}

/** The rate a mode resolves to, given the globals and a custom amount. */
export function effectiveRate(mode: CrewRateMode, globals: GlobalCrewRates, custom: number) {
  if (mode === "normal") return globals.normal;
  if (mode === "lead") return globals.lead;
  return custom;
}

/** "$18/h", or "$18.50/h" when there are cents. */
export function formatHourly(rate: number) {
  const amount = Number.isInteger(rate) ? rate.toLocaleString("en-US") : rate.toFixed(2);
  return `$${amount}/h`;
}

/** The roles on a user: Better Auth stores several as a comma-separated string. */
export function crewRateRoles(role: string) {
  const roles = role
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return roles.length ? roles : ["user"];
}

/**
 * Parse a rate typed into an input: a non-negative number, or `null` when the
 * text isn't one (empty, negative, not a number).
 */
export function parseRateInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/** Counts for the summary line: "14 people · 3 on custom rates · 2 with no rate". */
export function summarizeCrewRates(rows: CrewRateRow[]) {
  return {
    people: rows.length,
    custom: rows.filter((row) => crewRateMode(row) === "custom").length,
    noRate: rows.filter(hasNoRate).length,
  };
}
