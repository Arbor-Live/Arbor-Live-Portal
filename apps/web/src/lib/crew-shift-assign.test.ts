import { describe, expect, it } from "vitest";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import {
  assignPersonToSection,
  fillOpenSlotsFromAvailability,
  rankCandidatesForSection,
  setSectionHeadcount,
  type AssignableResponder,
  type CrewConflict,
  type ShiftDraftForAssign,
} from "@/lib/crew-shift-assign";
import { localDateTimeInputToMs } from "@/lib/crew-availability";

const getBlockRef = (block: TimelineBlockDraft) => block.clientId ?? block.id;

function block(id: string, blockType: TimelineBlockDraft["blockType"], start: string, end: string): TimelineBlockDraft {
  return {
    id,
    clientId: id,
    blockType,
    label: blockType,
    dayIndex: 0,
    startsAt: `2026-10-10T${start}`,
    endsAt: `2026-10-10T${end}`,
    notes: "",
  };
}

function slot(section: TimelineBlockDraft, extra: Partial<ShiftDraftForAssign> = {}): ShiftDraftForAssign {
  return {
    scheduleBlockId: section.id as ShiftDraftForAssign["scheduleBlockId"],
    scheduleBlockRef: section.clientId,
    role: "",
    personName: "",
    startsAt: section.startsAt,
    endsAt: section.endsAt,
    postedToExpense: false,
    notes: "",
    ...extra,
  };
}

function ms(time: string) {
  return localDateTimeInputToMs(`2026-10-10T${time}`)!;
}

const setup = block("setup", "setup", "14:00", "17:00");
const show = block("show", "show", "17:00", "22:00");

const alex: AssignableResponder = { userId: "alex", name: "Alex", responseStatus: "yes", respondedAt: 1 };
const bea: AssignableResponder = {
  userId: "bea",
  name: "Bea",
  responseStatus: "partial",
  respondedAt: 2,
  partialWindows: [{ scheduleBlockId: "setup", startsAt: ms("14:00"), endsAt: ms("17:00") }],
};
const cam: AssignableResponder = { userId: "cam", name: "Cam", responseStatus: "only_if_necessary", respondedAt: 3 };
const dee: AssignableResponder = { userId: "dee", name: "Dee", responseStatus: "no", respondedAt: 4 };

describe("fillOpenSlotsFromAvailability", () => {
  it("fills open slots per section from people who can work that section", () => {
    const result = fillOpenSlotsFromAvailability({
      shifts: [slot(setup), slot(setup), slot(show), slot(show)],
      blocks: [setup, show],
      responders: [alex, bea, cam, dee],
      conflicts: [],
      getBlockRef,
    });
    expect(result.filled).toBe(3);
    const bySection = (id: string) =>
      result.shifts.filter((shift) => shift.scheduleBlockId === id).map((shift) => shift.userId);
    expect(bySection("setup").sort()).toEqual(["alex", "bea"]);
    // Bea only picked setup; Cam is backup; Dee said no — one show slot stays open.
    expect(bySection("show")).toEqual(["alex", undefined]);
  });

  it("fills with the fewest-hours person first", () => {
    const gus: AssignableResponder = { userId: "gus", name: "Gus", responseStatus: "yes", respondedAt: 5 };
    const result = fillOpenSlotsFromAvailability({
      shifts: [slot(show)],
      blocks: [show],
      responders: [alex, gus],
      conflicts: [],
      getBlockRef,
      quarterHours: new Map([
        ["alex", 12],
        ["gus", 2],
      ]),
    });
    expect(result.shifts[0]?.userId).toBe("gus");
  });

  it("never overwrites trainee shifts or creates new slots", () => {
    const trainee = slot(setup, { crewApplicationId: "app1" as never, personName: "Trainee T" });
    const result = fillOpenSlotsFromAvailability({
      shifts: [trainee],
      blocks: [setup],
      responders: [alex],
      conflicts: [],
      getBlockRef,
    });
    expect(result.filled).toBe(0);
    expect(result.shifts).toEqual([trainee]);
  });

  it("skips people booked on another event at the same time", () => {
    const conflicts: CrewConflict[] = [
      { userId: "alex", eventId: "other", eventTitle: "Other gig", startsAt: ms("15:00"), endsAt: ms("16:00") },
    ];
    const result = fillOpenSlotsFromAvailability({
      shifts: [slot(setup)],
      blocks: [setup],
      responders: [alex],
      conflicts,
      getBlockRef,
    });
    expect(result.filled).toBe(0);
  });

  it("uses busy times to leave out a section they can't do", () => {
    const busy: AssignableResponder = {
      userId: "eve",
      name: "Eve",
      responseStatus: "partial",
      partialWindows: [{ scheduleBlockId: "show", startsAt: ms("17:00"), endsAt: ms("22:00") }],
      busyWindows: [{ startsAt: ms("17:00"), endsAt: ms("22:00") }],
    };
    const result = fillOpenSlotsFromAvailability({
      shifts: [slot(show)],
      blocks: [show],
      responders: [busy],
      conflicts: [],
      getBlockRef,
    });
    expect(result.filled).toBe(0);
  });
});

describe("rankCandidatesForSection", () => {
  it("orders available, then part, then backup, then no answer, then unavailable", () => {
    const people = [dee, cam, bea, alex, { userId: "fay", name: "Fay" }];
    const ranked = rankCandidatesForSection({
      block: setup,
      people,
      responders: [alex, bea, cam, dee],
      shifts: [],
      conflicts: [],
      getBlockRef,
    });
    expect(ranked.map((candidate) => [candidate.userId, candidate.level])).toEqual([
      ["alex", "available"],
      ["bea", "available"],
      ["cam", "backup"],
      ["fay", "pending"],
      ["dee", "unavailable"],
    ]);
  });

  it("puts whoever has the fewest hours this quarter first within the same availability", () => {
    const gus: AssignableResponder = { userId: "gus", name: "Gus", responseStatus: "yes", respondedAt: 5 };
    const ranked = rankCandidatesForSection({
      block: setup,
      people: [alex, gus, cam],
      responders: [alex, gus, cam],
      shifts: [],
      conflicts: [],
      getBlockRef,
      quarterHours: new Map([
        ["alex", 30],
        ["gus", 4],
        ["cam", 0],
      ]),
    });
    // Availability still wins: Cam (backup, 0h) stays after both yeses.
    expect(ranked.map((candidate) => candidate.userId)).toEqual(["gus", "alex", "cam"]);
  });

  it("leaves out people already on the section", () => {
    const ranked = rankCandidatesForSection({
      block: setup,
      people: [alex, bea],
      responders: [alex, bea],
      shifts: [slot(setup, { userId: "alex", personName: "Alex" })],
      conflicts: [],
      getBlockRef,
    });
    expect(ranked.map((candidate) => candidate.userId)).toEqual(["bea"]);
  });
});

describe("assignPersonToSection", () => {
  it("fills the first open slot, else adds a slot", () => {
    const filled = assignPersonToSection([slot(setup)], setup, { userId: "alex", name: "Alex" }, getBlockRef);
    expect(filled).toHaveLength(1);
    expect(filled[0]?.userId).toBe("alex");
    const added = assignPersonToSection(filled, setup, { userId: "bea", name: "Bea" }, getBlockRef);
    expect(added).toHaveLength(2);
    expect(added[1]?.userId).toBe("bea");
  });
});

describe("setSectionHeadcount", () => {
  it("adds open slots and removes only open ones", () => {
    const start = [slot(setup, { userId: "alex", personName: "Alex" })];
    const four = setSectionHeadcount(start, setup, 4, getBlockRef);
    expect(four).toHaveLength(4);
    const back = setSectionHeadcount(four, setup, 0, getBlockRef);
    expect(back).toEqual(start);
  });

  it("ignores trainees when counting", () => {
    const trainee = slot(setup, { crewApplicationId: "app1" as never });
    const next = setSectionHeadcount([trainee], setup, 2, getBlockRef);
    expect(next).toHaveLength(3);
    expect(setSectionHeadcount(next, setup, 0, getBlockRef)).toEqual([trainee]);
  });
});
