import { describe, expect, it } from "vitest";
import {
  insightsPresetDateInputs,
  insightsRangeFromSearchParams,
  insightsSelectionToSearch,
} from "./insights-range";

// Noon on Oct 2, 2026 in Los Angeles (19:00 UTC).
const NOW = Date.UTC(2026, 9, 2, 19, 0, 0);

describe("insightsPresetDateInputs", () => {
  it("ends every preset today (Pacific)", () => {
    for (const preset of ["30d", "90d", "12m", "ytd"] as const) {
      expect(insightsPresetDateInputs(preset, NOW).endDate).toBe("2026-10-02");
    }
  });

  it("counts today as the last of N days", () => {
    expect(insightsPresetDateInputs("30d", NOW).startDate).toBe("2026-09-03");
    expect(insightsPresetDateInputs("90d", NOW).startDate).toBe("2026-07-05");
  });

  it("starts 12 months on the first of the month eleven months back, and YTD on Jan 1", () => {
    expect(insightsPresetDateInputs("12m", NOW).startDate).toBe("2025-11-01");
    expect(insightsPresetDateInputs("ytd", NOW).startDate).toBe("2026-01-01");
  });
});

describe("range search params", () => {
  it("defaults to 12 months and keeps it out of the URL", () => {
    const selection = insightsRangeFromSearchParams(new URLSearchParams(""));
    expect(selection).toEqual({ kind: "preset", preset: "12m" });
    expect(insightsSelectionToSearch(selection)).toBe("");
  });

  it("round-trips presets and custom ranges", () => {
    expect(insightsSelectionToSearch(insightsRangeFromSearchParams(new URLSearchParams("range=90d")))).toBe(
      "?range=90d",
    );
    const custom = insightsRangeFromSearchParams(new URLSearchParams("from=2026-01-01&to=2026-03-31"));
    expect(custom).toEqual({ kind: "custom", startDate: "2026-01-01", endDate: "2026-03-31" });
    expect(insightsSelectionToSearch(custom)).toBe("?from=2026-01-01&to=2026-03-31");
  });

  it("falls back to the default for an unknown preset", () => {
    expect(insightsRangeFromSearchParams(new URLSearchParams("range=forever"))).toEqual({
      kind: "preset",
      preset: "12m",
    });
  });
});
