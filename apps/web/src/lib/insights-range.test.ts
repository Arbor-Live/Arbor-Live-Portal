import { describe, expect, it } from "vitest";
import {
  insightsPresetDateInputs,
  insightsRangeFromSearchParams,
  insightsSelectionToSearch,
} from "./insights-range";

// Noon on Oct 2, 2026 in Los Angeles (19:00 UTC): early Autumn 2026.
const NOW = Date.UTC(2026, 9, 2, 19, 0, 0);

describe("Stanford presets", () => {
  it("this quarter runs the whole Autumn 2026 quarter, through the break after it", () => {
    expect(insightsPresetDateInputs("this-quarter", NOW)).toEqual({
      startDate: "2026-09-22",
      endDate: "2027-01-03",
      periodLabel: "Autumn 2026",
    });
  });

  it("last quarter skips summer, when Arbor is closed", () => {
    expect(insightsPresetDateInputs("last-quarter", NOW)).toMatchObject({
      startDate: "2026-03-30",
      endDate: "2026-06-21",
      periodLabel: "Spring 2026",
    });
  });

  it("next quarter skips summer and runs its full span", () => {
    expect(insightsPresetDateInputs("next-quarter", NOW)).toMatchObject({
      startDate: "2027-01-04",
      endDate: "2027-03-28",
      periodLabel: "Winter 2027",
    });
  });

  it("academic years run autumn to the day before next autumn", () => {
    expect(insightsPresetDateInputs("this-year", NOW)).toMatchObject({
      startDate: "2026-09-22",
      endDate: "2027-09-19",
      periodLabel: "2026–27",
    });
    expect(insightsPresetDateInputs("last-year", NOW)).toMatchObject({
      startDate: "2025-09-22",
      endDate: "2026-09-21",
    });
  });

  it("falls back to 12 months outside the calendar's coverage", () => {
    const farFuture = Date.UTC(2040, 0, 15, 20);
    expect(insightsPresetDateInputs("this-quarter", farFuture)).toEqual(
      insightsPresetDateInputs("12m", farFuture),
    );
  });
});

describe("rolling presets", () => {
  it("end today and count today as the last of N days", () => {
    expect(insightsPresetDateInputs("30d", NOW)).toEqual({ startDate: "2026-09-03", endDate: "2026-10-02" });
    expect(insightsPresetDateInputs("90d", NOW)).toEqual({ startDate: "2026-07-05", endDate: "2026-10-02" });
    expect(insightsPresetDateInputs("12m", NOW)).toEqual({ startDate: "2025-11-01", endDate: "2026-10-02" });
  });
});

describe("range search params", () => {
  it("defaults to this quarter and keeps it out of the URL", () => {
    const selection = insightsRangeFromSearchParams(new URLSearchParams(""));
    expect(selection).toEqual({ kind: "preset", preset: "this-quarter" });
    expect(insightsSelectionToSearch(selection)).toBe("");
  });

  it("round-trips presets and custom ranges", () => {
    for (const range of ["last-quarter", "this-year", "90d"]) {
      expect(insightsSelectionToSearch(insightsRangeFromSearchParams(new URLSearchParams(`range=${range}`)))).toBe(
        `?range=${range}`,
      );
    }
    const custom = insightsRangeFromSearchParams(new URLSearchParams("from=2026-01-01&to=2026-03-31"));
    expect(custom).toEqual({ kind: "custom", startDate: "2026-01-01", endDate: "2026-03-31" });
    expect(insightsSelectionToSearch(custom)).toBe("?from=2026-01-01&to=2026-03-31");
  });

  it("falls back to the default for an unknown preset", () => {
    expect(insightsRangeFromSearchParams(new URLSearchParams("range=ytd"))).toEqual({
      kind: "preset",
      preset: "this-quarter",
    });
  });
});
