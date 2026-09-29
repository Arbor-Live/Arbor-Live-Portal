import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { groupTitleFromDayTitles, planMultiDayMembership } from "./eventGroups";
import { selectDaysInScope } from "./eventGroupTemplates";
import {
  artistLineAppliesToEvent,
  artistLineDayScope,
  sharedGroupId,
} from "./invoiceArtistDays";

const eventId = (value: string) => value as Id<"events">;
const groupId = (value: string) => value as Id<"eventSeries">;

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000;

type TestDay = {
  _id: Id<"events">;
  startAt: number;
  status: Doc<"events">["status"];
  occurrenceIndex: number;
  seriesDetached: boolean;
  seriesId: Id<"eventSeries">;
};

function day(index: number, partial: Partial<TestDay> = {}): TestDay {
  return {
    _id: eventId(`day-${index}`),
    startAt: NOW + index * DAY_MS,
    status: "tentative",
    occurrenceIndex: index,
    seriesDetached: false,
    seriesId: groupId("group"),
    ...partial,
  };
}

describe("selectDaysInScope", () => {
  const days = [
    day(0, { startAt: NOW - DAY_MS }),
    day(1),
    day(2, { seriesDetached: true }),
    day(3, { status: "cancelled" }),
    day(4),
  ];
  const ids = (rows: TestDay[]) => rows.map((row) => row._id);

  it("all days skips detached and cancelled days", () => {
    expect(ids(selectDaysInScope(days, "all", 0, NOW))).toEqual([
      eventId("day-0"),
      eventId("day-1"),
      eventId("day-4"),
    ]);
  });

  it("from this day on skips earlier and past days", () => {
    expect(ids(selectDaysInScope(days, "future", 0, NOW))).toEqual([
      eventId("day-1"),
      eventId("day-4"),
    ]);
    expect(ids(selectDaysInScope(days, "future", 2, NOW))).toEqual([eventId("day-4")]);
  });

  it("this day only reaches exactly that day, and never an overridden one", () => {
    expect(ids(selectDaysInScope(days, "this", 1, NOW))).toEqual([eventId("day-1")]);
    expect(ids(selectDaysInScope(days, "this", 2, NOW))).toEqual([]);
  });
});

describe("groupTitleFromDayTitles", () => {
  it("uses the shared base of dated day titles", () => {
    expect(
      groupTitleFromDayTitles(["Harvest Fest — Fri, Oct 3", "Harvest Fest — Sat, Oct 4"]),
    ).toBe("Harvest Fest");
  });

  it("falls back to Day 1's title when the days differ", () => {
    expect(groupTitleFromDayTitles(["Load-in", "Harvest Fest — Sat, Oct 4"])).toBe("Load-in");
    expect(groupTitleFromDayTitles(["Solo"])).toBe("Solo");
  });
});

describe("planMultiDayMembership", () => {
  const group = groupId("group");

  it("adds new days attached, in calendar order", () => {
    const plan = planMultiDayMembership(group, [{ _id: eventId("a") }, { _id: eventId("b") }], []);
    expect(plan).toEqual({
      assign: [
        { eventId: eventId("a"), occurrenceIndex: 0, seriesDetached: false },
        { eventId: eventId("b"), occurrenceIndex: 1, seriesDetached: false },
      ],
      release: [],
    });
  });

  it("is a no-op when membership already matches", () => {
    const days = [
      { _id: eventId("a"), seriesId: group, occurrenceIndex: 0 },
      { _id: eventId("b"), seriesId: group, occurrenceIndex: 1, seriesDetached: true },
    ];
    expect(planMultiDayMembership(group, days, days)).toEqual({ assign: [], release: [] });
  });

  it("reorders when a day moves, keeps overrides, and releases days that left", () => {
    const members = [
      { _id: eventId("a"), seriesId: group, occurrenceIndex: 0 },
      { _id: eventId("b"), seriesId: group, occurrenceIndex: 1, seriesDetached: true },
      { _id: eventId("gone"), seriesId: group, occurrenceIndex: 2 },
    ];
    const plan = planMultiDayMembership(group, [members[1]!, members[0]!], members);
    expect(plan.release).toEqual([eventId("gone")]);
    expect(plan.assign).toEqual([
      { eventId: eventId("b"), occurrenceIndex: 0, seriesDetached: true },
      { eventId: eventId("a"), occurrenceIndex: 1, seriesDetached: false },
    ]);
  });

  it("moves a day over from another booking's group, attached", () => {
    const plan = planMultiDayMembership(
      group,
      [{ _id: eventId("a"), seriesId: groupId("other"), occurrenceIndex: 0, seriesDetached: true }],
      [],
    );
    expect(plan.assign).toEqual([
      { eventId: eventId("a"), occurrenceIndex: 0, seriesDetached: false },
    ]);
  });
});

describe("artist line day scope", () => {
  const days = [
    { _id: eventId("d1"), seriesId: groupId("g") },
    { _id: eventId("d2"), seriesId: groupId("g") },
  ];

  it("finds the group only when every day shares it", () => {
    expect(sharedGroupId(days)).toBe(groupId("g"));
    expect(sharedGroupId([...days, { seriesId: undefined }])).toBeNull();
    expect(sharedGroupId([])).toBeNull();
  });

  it("an unscoped line applies to every occurrence of a recurring series", () => {
    const scope = artistLineDayScope(days, "recurring");
    expect(artistLineAppliesToEvent({ eventId: eventId("d2"), scope })).toBe(true);
  });

  it("an unscoped line on a multi-day booking stays on Day 1", () => {
    const scope = artistLineDayScope(days, "multi_day");
    expect(artistLineAppliesToEvent({ eventId: eventId("d1"), scope })).toBe(true);
    expect(artistLineAppliesToEvent({ eventId: eventId("d2"), scope })).toBe(false);
  });

  it("a line tagged to a day applies to that day only", () => {
    const scope = artistLineDayScope(days, "recurring");
    expect(
      artistLineAppliesToEvent({ lineEventId: eventId("d1"), eventId: eventId("d2"), scope }),
    ).toBe(false);
  });
});
