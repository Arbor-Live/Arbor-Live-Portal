import { describe, expect, it } from "vitest";
import type { Id } from "@/lib/convex-api";
import { mergeServerTraineeShifts, type EventShiftDraft } from "./event-schedule-draft";

function shift(partial: Partial<EventShiftDraft>): EventShiftDraft {
  return {
    role: "A1",
    personName: "",
    startsAt: "2026-10-12T18:00",
    endsAt: "2026-10-12T22:00",
    postedToExpense: false,
    notes: "",
    ...partial,
  };
}

const staff = shift({ id: "s1" as Id<"eventCrewShifts">, userId: "user-1", personName: "Ana" });
const trainee = shift({
  id: "t1" as Id<"eventCrewShifts">,
  role: "Trainee",
  personName: "Sam",
  crewApplicationId: "app-1" as Id<"crewApplications">,
});

describe("mergeServerTraineeShifts", () => {
  it("returns null when the server trainees match the baseline", () => {
    const state = { blocks: [], shifts: [staff, trainee] };
    expect(mergeServerTraineeShifts(state, state, [trainee])).toBeNull();
  });

  it("adds a trainee assigned on the server to both draft and baseline", () => {
    const baseline = { blocks: [], shifts: [staff] };
    const draft = { blocks: [], shifts: [{ ...staff, personName: "Ana (edited)" }] };
    const merged = mergeServerTraineeShifts(draft, baseline, [trainee]);
    expect(merged?.state.shifts).toEqual([draft.shifts[0], trainee]);
    expect(merged?.baseline.shifts).toEqual([staff, trainee]);
  });

  it("moves an unedited trainee when the server moves them", () => {
    const state = { blocks: [], shifts: [staff, trainee] };
    const moved = { ...trainee, startsAt: "2026-10-12T19:00" };
    const merged = mergeServerTraineeShifts(state, state, [moved]);
    expect(merged?.state.shifts).toEqual([staff, moved]);
    expect(merged?.baseline.shifts).toEqual([staff, moved]);
  });

  it("keeps a local edit when the server changes the same trainee", () => {
    const baseline = { blocks: [], shifts: [trainee] };
    const edited = { ...trainee, endsAt: "2026-10-12T23:00" };
    const moved = { ...trainee, startsAt: "2026-10-12T19:00" };
    const merged = mergeServerTraineeShifts({ blocks: [], shifts: [edited] }, baseline, [moved]);
    expect(merged?.state.shifts).toEqual([edited]);
    expect(merged?.baseline.shifts).toEqual([moved]);
  });

  it("keeps a local notes edit when the server moves the same trainee", () => {
    const baseline = { blocks: [], shifts: [trainee] };
    const edited = { ...trainee, notes: "Pair with the A1" };
    const moved = { ...trainee, startsAt: "2026-10-12T19:00" };
    const merged = mergeServerTraineeShifts({ blocks: [], shifts: [edited] }, baseline, [moved]);
    expect(merged?.state.shifts).toEqual([edited]);
  });

  it("drops a trainee removed on the server", () => {
    const state = { blocks: [], shifts: [staff, trainee] };
    const merged = mergeServerTraineeShifts(state, state, []);
    expect(merged?.state.shifts).toEqual([staff]);
    expect(merged?.baseline.shifts).toEqual([staff]);
  });

  it("doesn't bring back a trainee removed locally", () => {
    const baseline = { blocks: [], shifts: [staff, trainee] };
    expect(mergeServerTraineeShifts({ blocks: [], shifts: [staff] }, baseline, [trainee])).toBeNull();
  });
});
