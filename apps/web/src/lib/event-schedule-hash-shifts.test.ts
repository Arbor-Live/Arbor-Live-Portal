import { describe, expect, it } from "vitest";
import type { Id } from "@/lib/convex-api";
import { mergeServerHashShifts, type EventShiftDraft } from "./event-schedule-draft";

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
