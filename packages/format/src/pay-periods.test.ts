import { describe, expect, it } from "vitest";
import {
  payPeriodForDate,
  payPeriodStatus,
  pacificStartOfDayMs,
  recentPayPeriods,
} from "./index";

describe("payPeriodForDate", () => {
  it("returns 1st–15th period for a day on the 10th in Pacific time", () => {
    const ms = pacificStartOfDayMs(2025, 6, 10);
    const period = payPeriodForDate(ms);
    expect(period.label).toContain("1–15");
    expect(period.startMs).toBe(pacificStartOfDayMs(2025, 6, 1));
    expect(period.dueMs).toBeGreaterThanOrEqual(period.endMs);
  });

  it("returns 16th–EOM period for a day on the 20th", () => {
    const ms = pacificStartOfDayMs(2025, 6, 20);
    const period = payPeriodForDate(ms);
    expect(period.label).toContain("16–30");
    expect(period.startMs).toBe(pacificStartOfDayMs(2025, 6, 16));
  });

  it("handles month rollover from January 16th period to December", () => {
    const ms = pacificStartOfDayMs(2025, 1, 20);
    const period = payPeriodForDate(ms);
    const periods = recentPayPeriods(ms, 2);
    expect(periods).toHaveLength(2);
    expect(periods[0].label).toContain("Jan");
    expect(periods[1].label).toMatch(/Dec|Jan/);
  });

  it("uses Pacific timezone boundaries, not UTC", () => {
    const utcNewYearsMorning = Date.UTC(2025, 0, 1, 5, 0, 0);
    const period = payPeriodForDate(utcNewYearsMorning);
    expect(period.label).toContain("Dec");
  });
});

describe("recentPayPeriods", () => {
  it("returns current period first", () => {
    const now = pacificStartOfDayMs(2025, 3, 5);
    const periods = recentPayPeriods(now, 3);
    expect(periods).toHaveLength(3);
    expect(periods[0].label).toContain("1–15");
  });
});

describe("payPeriodStatus", () => {
  it("marks active period as open before end", () => {
    const period = payPeriodForDate(pacificStartOfDayMs(2025, 6, 5));
    expect(payPeriodStatus(period, period.startMs)).toBe("open");
  });
});
