import { describe, expect, test } from "vitest";
import type { Id } from "../_generated/dataModel";
import { onShiftPhase, summarizeOnShiftEvents } from "./crewShiftWindow";

const START = 1_000_000_000;
const END = 1_014_400_000;
const shift = { startsAt: START, endsAt: END };

describe("onShiftPhase", () => {
  test.each([
    ["one ms before the window opens", 996_399_999, null],
    ["exactly one hour before start", 996_400_000, "upcoming"],
    ["one ms before start", 999_999_999, "upcoming"],
    ["exactly at start", 1_000_000_000, "now"],
    ["exactly at end", 1_014_400_000, "now"],
    ["one ms after end", 1_014_400_001, "ended"],
    ["exactly one hour after end", 1_018_000_000, "ended"],
    ["one ms after the window closes", 1_018_000_001, null],
  ])("%s", (_label, now, expected) => {
    expect(onShiftPhase(shift, now)).toBe(expected);
  });
});

describe("summarizeOnShiftEvents", () => {
  const a = "event-a" as Id<"events">;
  const b = "event-b" as Id<"events">;
  const c = "event-c" as Id<"events">;
  const HOUR = 3_600_000;

  test("merges an event's in-window shifts and leaves out those outside it", () => {
    const now = 10 * HOUR;
    expect(
      summarizeOnShiftEvents(
        [
          { eventId: a, startsAt: 9 * HOUR, endsAt: 10 * HOUR },
          { eventId: a, startsAt: 10 * HOUR, endsAt: 12 * HOUR },
          { eventId: a, startsAt: 20 * HOUR, endsAt: 22 * HOUR },
        ],
        now,
      ),
    ).toEqual([{ eventId: a, startsAt: 9 * HOUR, endsAt: 12 * HOUR, phase: "now" }]);
  });

  test("counts an early call time as the start of the shift", () => {
    expect(
      summarizeOnShiftEvents(
        [{ eventId: a, callTime: 8 * HOUR, startsAt: 11 * HOUR, endsAt: 14 * HOUR }],
        7.5 * HOUR,
      ),
    ).toEqual([{ eventId: a, startsAt: 8 * HOUR, endsAt: 14 * HOUR, phase: "upcoming" }]);
    expect(
      summarizeOnShiftEvents(
        [{ eventId: a, callTime: 8 * HOUR, startsAt: 11 * HOUR, endsAt: 14 * HOUR }],
        9 * HOUR,
      ),
    ).toEqual([{ eventId: a, startsAt: 8 * HOUR, endsAt: 14 * HOUR, phase: "now" }]);
  });

  test("sorts shifts in progress first, then upcoming, then ended", () => {
    const now = 10 * HOUR;
    expect(
      summarizeOnShiftEvents(
        [
          { eventId: a, startsAt: 7 * HOUR, endsAt: 9.5 * HOUR },
          { eventId: b, startsAt: 10.5 * HOUR, endsAt: 12 * HOUR },
          { eventId: c, startsAt: 9 * HOUR, endsAt: 11 * HOUR },
        ],
        now,
      ).map((row) => [row.eventId, row.phase]),
    ).toEqual([
      [c, "now"],
      [b, "upcoming"],
      [a, "ended"],
    ]);
  });
});
