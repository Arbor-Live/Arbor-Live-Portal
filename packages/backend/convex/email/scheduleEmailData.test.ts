import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  buildCrewShiftGroupIcsEvent,
  crewInviteDebounceKey,
  crewInviteUid,
  groupShiftsByConsecutiveBlocks,
  userCoversEntireSchedule,
} from "./scheduleEmailData";

const id = (value: string) => value as Id<"eventScheduleBlocks">;

describe("userCoversEntireSchedule", () => {
  const blocks = [
    { _id: id("setup"), blockType: "setup" as const },
    { _id: id("show"), blockType: "show" as const },
    { _id: id("doors"), blockType: "doors" as const },
    { _id: id("set"), blockType: "set" as const },
  ];

  it("counts sections only, so shifts on every section cover the event", () => {
    expect(
      userCoversEntireSchedule([{ scheduleBlockId: id("setup") }, { scheduleBlockId: id("show") }], blocks),
    ).toBe(true);
  });

  it("is false when a section has no shift", () => {
    expect(userCoversEntireSchedule([{ scheduleBlockId: id("show") }], blocks)).toBe(false);
  });

  it("is false when the run of show has no sections", () => {
    expect(userCoversEntireSchedule([], [{ _id: id("doors"), blockType: "doors" as const }])).toBe(false);
  });
});

describe("crew invites, one per run of back-to-back shifts", () => {
  const eventId = "event1" as Id<"events">;
  const hour = 60 * 60 * 1000;
  const blocks = [
    { _id: id("setup"), label: "Setup", startsAt: 9 * hour, endsAt: 11 * hour },
    { _id: id("show"), label: "Show", startsAt: 11 * hour, endsAt: 14 * hour },
    { _id: id("strike"), label: "Strike", startsAt: 22 * hour, endsAt: 23 * hour },
  ];
  const shiftOn = (block: (typeof blocks)[number]) => ({
    scheduleBlockId: block._id,
    role: "Sound",
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    userId: "user1",
  });

  it("splits a gap into separate invites and merges back-to-back blocks", () => {
    const groups = groupShiftsByConsecutiveBlocks(blocks.map(shiftOn), blocks);
    expect(groups.map((group) => group.map((shift) => shift.scheduleBlockId))).toEqual([
      ["setup", "show"],
      ["strike"],
    ]);
    const first = buildCrewShiftGroupIcsEvent({
      eventId,
      assigneeKey: "user1",
      groupIndex: 0,
      eventTitle: "Spring Showcase",
      group: groups[0]!,
      blockLabelById: new Map(blocks.map((block) => [block._id, block.label])),
      timezone: "America/Los_Angeles",
      sequence: 2,
    });
    expect(first).toMatchObject({
      startAt: 9 * hour,
      endAt: 14 * hour,
      title: "Spring Showcase — Setup, Show (Sound)",
    });
  });

  it("keeps the pre-split UID and debounce key for the first invite", () => {
    expect(crewInviteUid(eventId, "user1", 0)).toBe("crew-event1-user1@arbor.st");
    expect(crewInviteDebounceKey("crew_scheduled", eventId, "user1", 0)).toBe(
      "crew_scheduled:event1:user1",
    );
  });

  it("gives later invites their own UID and debounce key", () => {
    expect(crewInviteUid(eventId, "user1", 1)).toBe("crew-event1-user1-2@arbor.st");
    expect(crewInviteDebounceKey("crew_unscheduled", eventId, "application:a1", 1)).toBe(
      "crew_unscheduled:event1:application:a1:2",
    );
  });
});
