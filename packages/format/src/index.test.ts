import { describe, expect, it } from "vitest";
import {
  PORTAL_TIMEZONE,
  formatDateTimeRange,
  formatUsd,
  formatUsdOptional,
  pacificDateAndTimeToMs,
  pacificDateKey,
  pacificDateTimeInputToMs,
  pacificScheduleDayCount,
  pacificScheduleMaxDayIndex,
  pacificDayIndexFromAnchor,
  toPacificDateTimeInput,
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

describe("pacificScheduleDayCount", () => {
  it("is 1 when start and end fall on the same Pacific calendar day", () => {
    const start = Date.UTC(2025, 5, 15, 19, 0, 0); // noon PDT
    const end = Date.UTC(2025, 5, 16, 6, 0, 0); // 11pm PDT same day
    expect(pacificScheduleDayCount(start, end)).toBe(1);
  });

  it("is 2 for overnight events under 24h (strike past midnight)", () => {
    // Mon 8pm PDT → Tue 2am PDT
    const start = Date.UTC(2025, 5, 17, 3, 0, 0); // Jun 16 8pm PDT
    const end = Date.UTC(2025, 5, 17, 9, 0, 0); // Jun 17 2am PDT
    expect(pacificDateKey(start)).toBe("2025-06-16");
    expect(pacificDateKey(end)).toBe("2025-06-17");
    expect(pacificScheduleDayCount(start, end)).toBe(2);
  });

  it("honors an explicit timezone override", () => {
    const start = Date.UTC(2025, 0, 1, 5, 0, 0);
    const end = Date.UTC(2025, 0, 1, 6, 0, 0);
    expect(pacificScheduleDayCount(start, end, "UTC")).toBe(1);
    expect(pacificScheduleDayCount(start, end, PORTAL_TIMEZONE)).toBe(1);
  });
});

describe("pacificScheduleMaxDayIndex", () => {
  it("allows day 1 when strike ends after midnight even if show end is 11pm", () => {
    // Event/show: Jun 16 8pm–11pm PDT. Strike ends 1am Jun 17.
    const eventStart = Date.UTC(2025, 5, 17, 3, 0, 0); // jun 16 8pm PDT
    const showEnd = Date.UTC(2025, 5, 17, 6, 0, 0); // jun 16 11pm PDT
    const strikeEnd = Date.UTC(2025, 5, 17, 8, 0, 0); // jun 17 1am PDT
    expect(pacificScheduleDayCount(eventStart, showEnd)).toBe(1);
    expect(pacificScheduleMaxDayIndex(eventStart, showEnd, strikeEnd)).toBe(1);
  });
});

describe("pacificDayIndexFromAnchor", () => {
  it("is 0 for a same-evening strike start and 1 after midnight", () => {
    const eventStart = Date.UTC(2025, 5, 17, 3, 0, 0); // jun 16 8pm PDT
    const strikeStartEvening = Date.UTC(2025, 5, 17, 6, 0, 0); // jun 16 11pm
    const strikeStartMorning = Date.UTC(2025, 5, 17, 8, 0, 0); // jun 17 1am
    expect(pacificDayIndexFromAnchor(eventStart, strikeStartEvening)).toBe(0);
    expect(pacificDayIndexFromAnchor(eventStart, strikeStartMorning)).toBe(1);
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

describe("toPacificDateTimeInput / pacificDateTimeInputToMs", () => {
  it("round-trips a PDT afternoon instant", () => {
    // 2025-06-16 18:00 PDT = 2025-06-17 01:00 UTC
    const ms = Date.UTC(2025, 5, 17, 1, 0, 0);
    expect(toPacificDateTimeInput(ms)).toBe("2025-06-16T18:00");
    expect(pacificDateTimeInputToMs("2025-06-16T18:00")).toBe(ms);
  });

  it("round-trips a PST winter instant", () => {
    // 2025-01-15 09:30 PST = 2025-01-15 17:30 UTC
    const ms = Date.UTC(2025, 0, 15, 17, 30, 0);
    expect(toPacificDateTimeInput(ms)).toBe("2025-01-15T09:30");
    expect(pacificDateTimeInputToMs("2025-01-15T09:30")).toBe(ms);
  });

  it("parses seconds when present", () => {
    const ms = pacificDateTimeInputToMs("2025-06-16T18:00:59");
    expect(ms).toBe(Date.UTC(2025, 5, 17, 1, 0, 59));
  });

  it("returns null for empty or invalid input", () => {
    expect(pacificDateTimeInputToMs("")).toBeNull();
    expect(pacificDateTimeInputToMs("not-a-date")).toBeNull();
  });
});

describe("pacificDateAndTimeToMs", () => {
  it("combines date and time in portal timezone", () => {
    expect(pacificDateAndTimeToMs("2025-06-16", "18:00")).toBe(Date.UTC(2025, 5, 17, 1, 0, 0));
  });
});

describe("PORTAL_TIMEZONE", () => {
  it("is the Pacific zone the app formats against", () => {
    expect(PORTAL_TIMEZONE).toBe("America/Los_Angeles");
  });
});
