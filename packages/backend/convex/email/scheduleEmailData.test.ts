import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  buildCrewShiftGroupIcsEvent,
  crewInviteDebounceKey,
  crewInviteUid,
  groupShiftsByConsecutiveBlocks,
  legacyCrewInviteDebounceKey,
  legacyCrewInviteUid,
  shiftGroupAnchor,
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
  const shiftOn = (block: (typeof blocks)[number], role = "Sound") => ({
    scheduleBlockId: block._id,
    role,
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    userId: "user1",
  });
  const [setup, show, strike] = blocks as [
    (typeof blocks)[number],
    (typeof blocks)[number],
    (typeof blocks)[number],
  ];
  const blockIds = (groups: ReturnType<typeof groupShiftsByConsecutiveBlocks>) =>
    groups.map((group) => group.map((shift) => shift.scheduleBlockId));

  it("splits a gap into separate invites and merges back-to-back blocks", () => {
    const groups = groupShiftsByConsecutiveBlocks(blocks.map((block) => shiftOn(block)), blocks);
    expect(blockIds(groups)).toEqual([["setup", "show"], ["strike"]]);
    const first = buildCrewShiftGroupIcsEvent({
      uid: crewInviteUid(eventId, "user1", shiftGroupAnchor(groups[0]!)),
      eventTitle: "Spring Showcase",
      group: groups[0]!,
      blockLabelById: new Map(blocks.map((block) => [block._id, block.label])),
      timezone: "America/Los_Angeles",
      sequence: 2,
    });
    expect(first).toMatchObject({
      uid: "crew-event1-user1-setup@arbor.st",
      startAt: 9 * hour,
      endAt: 14 * hour,
      title: "Spring Showcase — Setup, Show (Sound)",
    });
  });

  it("puts overlapping shifts (two roles in one block) in one invite", () => {
    const groups = groupShiftsByConsecutiveBlocks(
      [shiftOn(show, "Sound"), shiftOn(show, "Lighting")],
      blocks,
    );
    expect(groups).toHaveLength(1);
  });

  it("keeps a surviving run's invite when an earlier run is removed", () => {
    const before = groupShiftsByConsecutiveBlocks([shiftOn(setup), shiftOn(strike)], blocks);
    const after = groupShiftsByConsecutiveBlocks([shiftOn(strike)], blocks);
    expect(before.map(shiftGroupAnchor)).toEqual(["setup", "strike"]);
    expect(after.map(shiftGroupAnchor)).toEqual(["strike"]);
  });

  it("keys runs by their first block, apart from the pre-split merged invite", () => {
    expect(crewInviteDebounceKey("crew_scheduled", eventId, "application:a1", "show")).toBe(
      "crew_scheduled:event1:application:a1:show",
    );
    expect(legacyCrewInviteUid(eventId, "user1")).toBe("crew-event1-user1@arbor.st");
    expect(legacyCrewInviteDebounceKey("crew_scheduled", eventId, "user1")).toBe(
      "crew_scheduled:event1:user1",
    );
  });
});
