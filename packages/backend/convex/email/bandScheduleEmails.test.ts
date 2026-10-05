import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { bandInviteUid, changedActSlots, liveActSlotWindow } from "./bandScheduleEmails";

const hour = 60 * 60 * 1000;
const now = 100 * hour;
const row = {
  _id: "part1" as Id<"eventBandParticipations">,
  eventId: "event1" as Id<"events">,
  organizationId: "org1",
  soundcheckStartsAt: now + 4 * hour,
  soundcheckEndsAt: now + 5 * hour,
  setStartsAt: now + 9 * hour,
  setEndsAt: now + 10 * hour,
};

describe("changedActSlots", () => {
  it("is empty when no window moved", () => {
    expect(changedActSlots(row, { ...row }, now)).toEqual([]);
  });

  it("only re-sends the window that changed", () => {
    expect(changedActSlots(row, { ...row, setEndsAt: now + 11 * hour }, now)).toEqual(["set"]);
  });

  it("flags a newly set window and a cleared one", () => {
    const noSoundcheck = { ...row, soundcheckStartsAt: undefined, soundcheckEndsAt: undefined };
    expect(changedActSlots(noSoundcheck, row, now)).toEqual(["soundcheck"]);
    expect(changedActSlots(row, noSoundcheck, now)).toEqual(["soundcheck"]);
  });

  it("flags both windows when the act leaves the bill", () => {
    expect(changedActSlots(row, null, now)).toEqual(["soundcheck", "set"]);
  });

  it("cancels a window moved into the past", () => {
    const moved = { ...row, soundcheckStartsAt: now - 3 * hour, soundcheckEndsAt: now - 2 * hour };
    expect(changedActSlots(row, moved, now)).toEqual(["soundcheck"]);
    expect(liveActSlotWindow(moved, "soundcheck", now)).toBeNull();
  });

  it("ignores windows that are already over", () => {
    const past = { ...row, soundcheckStartsAt: now - 3 * hour, soundcheckEndsAt: now - 2 * hour };
    expect(changedActSlots(past, { ...past, soundcheckEndsAt: now - hour }, now)).toEqual([]);
  });

  it("ignores half-set windows", () => {
    expect(changedActSlots(null, { ...row, setEndsAt: undefined, soundcheckEndsAt: undefined }, now)).toEqual(
      [],
    );
  });
});

describe("bandInviteUid", () => {
  it("gives soundcheck and set their own invite", () => {
    expect(bandInviteUid(row._id, "soundcheck")).not.toBe(bandInviteUid(row._id, "set"));
  });
});
