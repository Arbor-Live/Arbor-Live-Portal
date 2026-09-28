import { describe, expect, it } from "vitest";
import { pacificDateAndTimeToMs, toPacificDateTimeInput } from "@/lib/format";
import { dayKeyForStart, eventDayKeys, timeWindowToMs } from "./performance-times";

const at = (date: string, time: string) => pacificDateAndTimeToMs(date, time)!;
const show = (ms: number) => toPacificDateTimeInput(ms);

describe("performance times", () => {
  const eventStart = at("2026-10-14", "18:00");

  it("uses the event's day, so only times are entered", () => {
    const window = timeWindowToMs("2026-10-14", "19:00", "20:00")!;
    expect(window.map(show)).toEqual(["2026-10-14T19:00", "2026-10-14T20:00"]);
  });

  it("rolls a set past midnight onto the next day", () => {
    const window = timeWindowToMs("2026-10-14", "23:30", "00:30")!;
    expect(window.map(show)).toEqual(["2026-10-14T23:30", "2026-10-15T00:30"]);
  });

  it("puts an after-midnight start on the next calendar day", () => {
    const window = timeWindowToMs("2026-10-14", "01:00", "02:00")!;
    expect(window.map(show)).toEqual(["2026-10-15T01:00", "2026-10-15T02:00"]);
    // …and reading it back lands on the event's night, not the next day.
    expect(dayKeyForStart(window[0], ["2026-10-14"])).toBe("2026-10-14");
  });

  it("lists every day of a multi-day event, and one day for a late-night show", () => {
    expect(eventDayKeys(eventStart, at("2026-10-16", "23:00"))).toEqual([
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
    expect(eventDayKeys(eventStart, at("2026-10-15", "01:30"))).toEqual(["2026-10-14"]);
  });

  it("treats a small-hours set on a later festival day as that night", () => {
    const days = ["2026-10-14", "2026-10-15"];
    const window = timeWindowToMs("2026-10-15", "00:30", "01:15")!;
    expect(window.map(show)).toEqual(["2026-10-16T00:30", "2026-10-16T01:15"]);
    expect(dayKeyForStart(window[0], days)).toBe("2026-10-15");
  });

  it("maps each day + time to one instant, so saved times reopen on their day", () => {
    const days = ["2026-10-14", "2026-10-15"];
    // 06:30 is a morning slot on that day, not after-midnight.
    const morning = timeWindowToMs("2026-10-14", "06:30", "07:00")!;
    expect(show(morning[0])).toBe("2026-10-14T06:30");
    expect(dayKeyForStart(morning[0], days)).toBe("2026-10-14");
    // 01:00 on day 1 is that night, after midnight: a different instant from day 2's 01:00.
    const lateOne = timeWindowToMs("2026-10-14", "01:00", "02:00")!;
    const lateTwo = timeWindowToMs("2026-10-15", "01:00", "02:00")!;
    expect(lateOne[0]).not.toBe(lateTwo[0]);
    expect(dayKeyForStart(lateOne[0], days)).toBe("2026-10-14");
    expect(dayKeyForStart(lateTwo[0], days)).toBe("2026-10-15");
  });
});
