/**
 * Arbor's per-quarter hours expectations for crew. Under the minimum doesn't
 * meet the requirement; minimum to expected (inclusive) meets it; over
 * expected is working above expectations.
 */
export const CREW_QUARTER_MINIMUM_HOURS = 20;
export const CREW_QUARTER_EXPECTED_HOURS = 50;

export const CREW_HOURS_BANDS = ["below_minimum", "meets_minimum", "above_expected"] as const;
export type CrewHoursBand = (typeof CREW_HOURS_BANDS)[number];

export function crewHoursBand(hours: number): CrewHoursBand {
  if (hours < CREW_QUARTER_MINIMUM_HOURS) return "below_minimum";
  if (hours <= CREW_QUARTER_EXPECTED_HOURS) return "meets_minimum";
  return "above_expected";
}
