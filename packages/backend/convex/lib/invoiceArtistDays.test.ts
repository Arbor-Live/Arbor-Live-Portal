import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { artistLineAppliesToEvent, isGroupBooking } from "./invoiceArtistDays";

const groupId = "group1" as Id<"eventSeries">;
const otherGroupId = "group2" as Id<"eventSeries">;

function event(partial: Partial<Doc<"events">> = {}): Doc<"events"> {
  return {
    _id: "event1" as Id<"events">,
    _creationTime: 0,
    title: "Show",
    status: "tentative",
    visibility: "public",
    startAt: 0,
    endAt: 0,
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

describe("isGroupBooking", () => {
  it("is true when every day shares one group", () => {
    expect(isGroupBooking([event({ groupId }), event({ groupId })])).toBe(true);
  });

  it("falls back to seriesId for rows without a group link", () => {
    const seriesId = "series1" as Id<"eventSeries">;
    expect(isGroupBooking([event({ seriesId }), event({ seriesId })])).toBe(true);
  });

  it("is false for mixed groups or ungrouped days", () => {
    expect(isGroupBooking([event({ groupId }), event({ groupId: otherGroupId })])).toBe(false);
    expect(isGroupBooking([event({ groupId }), event()])).toBe(false);
    expect(isGroupBooking([])).toBe(false);
  });
});

describe("artistLineAppliesToEvent", () => {
  it("an explicit day always wins", () => {
    const day = event({ _id: "day2" as Id<"events"> });
    expect(
      artistLineAppliesToEvent({
        lineEventId: day._id,
        eventId: day._id,
        firstLinkedEventId: "day1" as Id<"events">,
        isGroupBooking: false,
      }),
    ).toBe(true);
    expect(
      artistLineAppliesToEvent({
        lineEventId: "day1" as Id<"events">,
        eventId: day._id,
        firstLinkedEventId: "day1" as Id<"events">,
        isGroupBooking: true,
      }),
    ).toBe(false);
  });

  it("an unscoped line applies to every day in a group", () => {
    expect(
      artistLineAppliesToEvent({
        eventId: "day2" as Id<"events">,
        firstLinkedEventId: "day1" as Id<"events">,
        isGroupBooking: true,
      }),
    ).toBe(true);
  });

  it("an unscoped line falls back to the first linked day otherwise", () => {
    expect(
      artistLineAppliesToEvent({
        eventId: "day1" as Id<"events">,
        firstLinkedEventId: "day1" as Id<"events">,
        isGroupBooking: false,
      }),
    ).toBe(true);
    expect(
      artistLineAppliesToEvent({
        eventId: "day2" as Id<"events">,
        firstLinkedEventId: "day1" as Id<"events">,
        isGroupBooking: false,
      }),
    ).toBe(false);
  });
});
