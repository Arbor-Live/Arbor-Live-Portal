import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { groupTemplateTargets } from "./eventGroupTemplates";

const seriesId = "series1" as Id<"eventSeries">;
const now = 1_000_000;

function event(partial: Partial<Doc<"events">> & { occurrenceIndex: number }): Doc<"events"> {
  return {
    _id: `event${partial.occurrenceIndex}` as Id<"events">,
    _creationTime: 0,
    title: "Show",
    status: "tentative",
    visibility: "public",
    seriesId,
    startAt: now + partial.occurrenceIndex * 1_000,
    endAt: now + partial.occurrenceIndex * 1_000 + 100,
    timezone: "America/Los_Angeles",
    spansMultipleDays: false,
    setupOnly: false,
    strikeOnly: false,
    requiresShowWindow: true,
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as Doc<"events">;
}

describe("groupTemplateTargets", () => {
  it("returns every attached, non-cancelled occurrence for scope all", () => {
    const occurrences = [
      event({ occurrenceIndex: 0 }),
      event({ occurrenceIndex: 1, status: "cancelled" }),
      event({ occurrenceIndex: 2, seriesDetached: true }),
      event({ occurrenceIndex: 3, seriesId: undefined }),
    ];
    const targets = groupTemplateTargets(occurrences, "all", 0, now);
    expect(targets.map((target) => target.eventId)).toEqual(["event0"]);
  });

  it("picks only the matching occurrence for scope this", () => {
    const occurrences = [event({ occurrenceIndex: 0 }), event({ occurrenceIndex: 1 })];
    const targets = groupTemplateTargets(occurrences, "this", 1, now);
    expect(targets.map((target) => target.eventId)).toEqual(["event1"]);
  });

  it("keeps this-and-future occurrences for scope future", () => {
    const occurrences = [
      event({ occurrenceIndex: 0 }),
      event({ occurrenceIndex: 1 }),
      event({ occurrenceIndex: 2 }),
    ];
    const targets = groupTemplateTargets(occurrences, "future", 1, now);
    expect(targets.map((target) => target.eventId)).toEqual(["event1", "event2"]);
  });

  it("excludes a past occurrence even when its index is in range", () => {
    const occurrences = [
      event({ occurrenceIndex: 0, startAt: now - 10_000, endAt: now - 9_000 }),
      event({ occurrenceIndex: 1 }),
    ];
    const targets = groupTemplateTargets(occurrences, "future", 0, now);
    expect(targets.map((target) => target.eventId)).toEqual(["event1"]);
  });

  it("carries each target's start time for offset templates", () => {
    const occurrences = [event({ occurrenceIndex: 0 })];
    const targets = groupTemplateTargets(occurrences, "all", 0, now);
    expect(targets[0]).toEqual({ eventId: "event0", startAt: now });
  });
});
