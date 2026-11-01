import { describe, expect, it } from "vitest";
import type { Night } from "@/components/availability/night-card";
import type { PostEventWorkRow } from "@/components/events/post-event-work-card";
import { buildCrewTodos, endedLabel } from "@/lib/crew-todo";

function night(nightKey: string, answer: { coversNight: boolean } | null = null) {
  return { nightKey, answer } as Night;
}

function row(eventId: string, endAt: number, done: Partial<PostEventWorkRow> = {}) {
  return { eventId, endAt, feedbackSubmitted: false, mediaResolved: false, ...done } as PostEventWorkRow;
}

const keys = (nights: Night[], rows: PostEventWorkRow[], deferred: string[] = []) =>
  buildCrewTodos(nights, rows, deferred).map((todo) => todo.key);

describe("buildCrewTodos", () => {
  it("lists nights soonest first, then events most recently ended first, review before photos", () => {
    expect(keys([night("2026-11-07"), night("2026-11-06")], [row("old", 100), row("new", 200)])).toEqual([
      "night:2026-11-06",
      "night:2026-11-07",
      "review:new",
      "photos:new",
      "review:old",
      "photos:old",
    ]);
  });

  it("skips answered nights and keeps ones whose answer no longer covers the night", () => {
    expect(
      keys([night("2026-11-06", { coversNight: true }), night("2026-11-07", { coversNight: false })], []),
    ).toEqual(["night:2026-11-07"]);
  });

  it("carries only the part of an event still outstanding", () => {
    expect(
      keys([], [row("a", 200, { feedbackSubmitted: true }), row("b", 100, { mediaResolved: true })]),
    ).toEqual(["photos:a", "review:b"]);
  });

  it("yields nothing for a fully done event", () => {
    expect(keys([], [row("a", 100, { feedbackSubmitted: true, mediaResolved: true })])).toEqual([]);
  });

  it("moves deferred cards to the back in the order deferred", () => {
    expect(
      keys([night("2026-11-06"), night("2026-11-07")], [row("a", 100)], ["photos:a", "night:2026-11-06"]),
    ).toEqual(["night:2026-11-07", "review:a", "photos:a", "night:2026-11-06"]);
  });

  it("ignores a deferred key whose card is gone", () => {
    expect(keys([night("2026-11-06")], [], ["review:gone"])).toEqual(["night:2026-11-06"]);
  });
});

describe("endedLabel", () => {
  // Sat Nov 7 2026, 11:40 PM Pacific.
  const endAt = Date.UTC(2026, 10, 8, 7, 40);

  it("uses the weekday within the last week", () => {
    expect(endedLabel(endAt, endAt + 3_600_000)).toBe("Sat 11:40 PM");
  });

  it("uses the date once a weekday would be ambiguous", () => {
    expect(endedLabel(endAt, endAt + 7 * 86_400_000)).toBe("Sat, Nov 7, 11:40 PM");
  });
});
