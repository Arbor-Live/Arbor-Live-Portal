import { describe, expect, it } from "vitest";
import type { Id } from "@/lib/convex-api";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import {
  mergeServerHashSchedule,
  mergeServerHashShifts,
  type EventShiftDraft,
} from "./event-schedule-draft";

function shift(partial: Partial<EventShiftDraft>): EventShiftDraft {
  return {
    role: "Hash",
    personName: "",
    startsAt: "2026-11-03T16:00",
    endsAt: "2026-11-03T17:00",
    postedToExpense: false,
    notes: "",
    ...partial,
  };
}

const ana = shift({ id: "s1" as Id<"eventCrewShifts">, userId: "ana" });
const ben = shift({ id: "s2" as Id<"eventCrewShifts">, userId: "ben" });

describe("mergeServerHashShifts", () => {
  it("returns null when the server matches the baseline", () => {
    const state = { blocks: [], shifts: [ana] };
    expect(mergeServerHashShifts(state, state, [ana])).toBeNull();
  });

  it("pulls in someone booked meanwhile, so a save can't unbook them", () => {
    const state = { blocks: [], shifts: [] };
    const merged = mergeServerHashShifts(state, state, [ana]);
    expect(merged?.state.shifts).toEqual([ana]);
    expect(merged?.baseline.shifts).toEqual([ana]);
  });

  it("keeps a local addition beside someone booked meanwhile", () => {
    const added = shift({ userId: "ben" });
    const merged = mergeServerHashShifts({ blocks: [], shifts: [added] }, { blocks: [], shifts: [] }, [ana]);
    expect(merged?.state.shifts).toEqual([added, ana]);
    expect(merged?.baseline.shifts).toEqual([ana]);
  });

  it("drops someone unbooked meanwhile", () => {
    const state = { blocks: [], shifts: [ana, ben] };
    const merged = mergeServerHashShifts(state, state, [ben]);
    expect(merged?.state.shifts).toEqual([ben]);
    expect(merged?.baseline.shifts).toEqual([ben]);
  });

  it("re-times an unedited booking when the hash moves", () => {
    const state = { blocks: [], shifts: [ana] };
    const moved = { ...ana, startsAt: "2026-11-05T16:00", endsAt: "2026-11-05T17:00" };
    const merged = mergeServerHashShifts(state, state, [moved]);
    expect(merged?.state.shifts).toEqual([moved]);
    expect(merged?.baseline.shifts).toEqual([moved]);
  });

  it("doesn't bring back someone removed locally", () => {
    const baseline = { blocks: [], shifts: [ana, ben] };
    expect(mergeServerHashShifts({ blocks: [], shifts: [ben] }, baseline, [ana, ben])).toBeNull();
  });

  it("swaps a saved row for its server row instead of doubling the person", () => {
    const saved = shift({ userId: "ben", role: "", personName: "Ben" });
    const server = { ...ben, personName: "Ben" };
    const state = { blocks: [], shifts: [ana, saved] };
    const merged = mergeServerHashShifts(state, state, [ana, server]);
    expect(merged?.state.shifts).toEqual([ana, server]);
    expect(merged?.baseline.shifts).toEqual([ana, server]);
  });
});

describe("mergeServerHashSchedule", () => {
  const blockId = "b1" as Id<"eventScheduleBlocks">;
  const section: TimelineBlockDraft = {
    id: blockId,
    clientId: blockId,
    blockType: "custom",
    label: "Cleaning",
    dayIndex: 0,
    startsAt: "2026-11-03T16:00",
    endsAt: "2026-11-03T17:00",
    notes: "",
  };
  const movedTimes = { startsAt: "2026-11-05T18:00", endsAt: "2026-11-05T19:00" };
  const movedSection = { ...section, ...movedTimes };
  const booked = { ...ana, scheduleBlockId: blockId, scheduleBlockRef: blockId };
  const movedBooked = { ...booked, ...movedTimes };

  it("returns null when the server matches the draft", () => {
    const state = { blocks: [section], shifts: [booked] };
    expect(mergeServerHashSchedule(state, state, [section], [booked])).toBeNull();
  });

  it("moves the block with the hash, so its next save isn't refused", () => {
    const state = { blocks: [section], shifts: [booked] };
    const merged = mergeServerHashSchedule(state, state, [movedSection], [movedBooked]);
    expect(merged?.state.blocks).toEqual([movedSection]);
    expect(merged?.baseline.blocks).toEqual([movedSection]);
  });

  it("doesn't mistake a moved booking for custom times", () => {
    const state = { blocks: [section], shifts: [booked] };
    const merged = mergeServerHashSchedule(state, state, [movedSection], [movedBooked]);
    expect(merged?.state.shifts).toEqual([movedBooked]);
    expect(merged?.state.shifts[0]?.timesOverridden).toBeFalsy();
    expect(merged?.baseline.shifts).toEqual([movedBooked]);
  });

  it("keeps a local label and notes edit through a move", () => {
    const baseline = { blocks: [section], shifts: [booked] };
    const edited = { ...section, label: "Gear closet", notes: "Bring gloves" };
    const merged = mergeServerHashSchedule(
      { blocks: [edited], shifts: [booked] },
      baseline,
      [movedSection],
      [movedBooked],
    );
    expect(merged?.state.blocks).toEqual([{ ...edited, ...movedTimes }]);
    expect(merged?.baseline.blocks).toEqual([movedSection]);
  });

  it("takes a rename made elsewhere when this page hasn't touched the label", () => {
    const state = { blocks: [section], shifts: [booked] };
    const renamed = { ...section, label: "Closet" };
    const merged = mergeServerHashSchedule(state, state, [renamed], [booked]);
    expect(merged?.state.blocks).toEqual([renamed]);
  });

  it("gives an unsaved row the section's times after a move", () => {
    const added = shift({ userId: "ben", scheduleBlockId: blockId, scheduleBlockRef: blockId });
    const merged = mergeServerHashSchedule(
      { blocks: [section], shifts: [booked, added] },
      { blocks: [section], shifts: [booked] },
      [movedSection],
      [movedBooked],
    );
    expect(merged?.state.shifts).toEqual([movedBooked, { ...added, ...movedTimes }]);
    expect(merged?.baseline.shifts).toEqual([movedBooked]);
  });

  it("settles after one pass", () => {
    const state = { blocks: [section], shifts: [booked] };
    const merged = mergeServerHashSchedule(state, state, [movedSection], [movedBooked]);
    expect(mergeServerHashSchedule(merged!.state, merged!.baseline, [movedSection], [movedBooked])).toBeNull();
  });
});
