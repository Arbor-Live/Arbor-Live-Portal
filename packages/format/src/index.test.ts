import { describe, expect, it } from "vitest";
import {
  PORTAL_TIMEZONE,
  formatDateTimeRange,
  formatUsd,
  formatUsdOptional,
  pacificDateKey,
} from "./index";

describe("formatUsd", () => {
  it("formats whole and fractional dollars", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(1234.5)).toBe("$1,234.50");
  });

  it("formats negative amounts", () => {
    expect(formatUsd(-42)).toBe("-$42.00");
  });
});

describe("formatUsdOptional", () => {
  it("returns a dash for null/undefined", () => {
    expect(formatUsdOptional(undefined)).toBe("-");
    expect(formatUsdOptional(null)).toBe("-");
  });

  it("formats a present value", () => {
    expect(formatUsdOptional(10)).toBe("$10.00");
  });
});

describe("pacificDateKey", () => {
  it("uses the portal timezone, not UTC, to bucket the day", () => {
    // 2025-01-01T05:00:00Z is still 2024-12-31 in Pacific time.
    const ms = Date.UTC(2025, 0, 1, 5, 0, 0);
    expect(pacificDateKey(ms)).toBe("2024-12-31");
  });

  it("honors an explicit timezone override", () => {
    const ms = Date.UTC(2025, 0, 1, 5, 0, 0);
    expect(pacificDateKey(ms, "UTC")).toBe("2025-01-01");
  });
});

describe("formatDateTimeRange", () => {
  it("collapses to a single day with a time-only end", () => {
    const start = Date.UTC(2025, 5, 15, 19, 0, 0); // noon PDT
    const end = Date.UTC(2025, 5, 15, 22, 0, 0); // 3pm PDT
    const label = formatDateTimeRange(start, end);
    // Same Pacific day => "<full start> – <time only end>", one date rendered.
    expect(label).toContain("–");
    expect(label.match(/Jun/g)?.length).toBe(1);
  });

  it("renders both dates when the range spans days", () => {
    const start = Date.UTC(2025, 5, 15, 19, 0, 0);
    const end = Date.UTC(2025, 5, 16, 22, 0, 0);
    const label = formatDateTimeRange(start, end);
    expect(label.match(/Jun/g)?.length).toBe(2);
  });
});

describe("PORTAL_TIMEZONE", () => {
  it("is the Pacific zone the app formats against", () => {
    expect(PORTAL_TIMEZONE).toBe("America/Los_Angeles");
  });
});
