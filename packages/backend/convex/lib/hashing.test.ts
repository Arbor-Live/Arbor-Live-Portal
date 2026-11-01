import { describe, expect, it } from "vitest";
import {
  holdsQuarterSpot,
  checklistProblems,
  deriveQuarterState,
  fillFromAvailability,
  flattenChecklist,
  followingHashingQuarter,
  hashingQuarterFor,
  isLapsed,
  isOffWeek,
  planRegularDates,
  regularDateKeys,
} from "./hashing";
import { HASHING_CHECKLIST_SEED } from "./hashingChecklistSeed";

const TUESDAY = 2;
const THURSDAY = 4;

describe("hashingQuarterFor", () => {
  it("uses the quarter in session", () => {
    expect(hashingQuarterFor("2026-11-01")?.id).toBe("2026-27-autumn");
  });
  it("uses the next quarter during a break", () => {
    expect(hashingQuarterFor("2026-12-20")?.id).toBe("2026-27-winter");
  });
  it("skips summer, which has no requirement", () => {
    expect(hashingQuarterFor("2027-07-10")?.id).toBe("2027-28-autumn");
    expect(followingHashingQuarter(hashingQuarterFor("2027-05-01")!)?.id).toBe("2027-28-autumn");
  });
});

describe("regular dates", () => {
  it("lists every chosen weekday through the end", () => {
    expect(regularDateKeys({ weekday: TUESDAY, fromKey: "2026-11-01", toKey: "2026-11-17" })).toEqual([
      "2026-11-03",
      "2026-11-10",
      "2026-11-17",
    ]);
  });
  it("includes today when today is that weekday", () => {
    expect(regularDateKeys({ weekday: TUESDAY, fromKey: "2026-11-03", toKey: "2026-11-03" })).toEqual(["2026-11-03"]);
  });
  it("treats Thanksgiving and finals as off weeks", () => {
    expect(isOffWeek("2026-11-24")).toBe(true);
    expect(isOffWeek("2026-12-08")).toBe(true);
    expect(isOffWeek("2026-12-01")).toBe(false);
  });
  it("creates each week once and marks off weeks", () => {
    const plan = planRegularDates({ existing: [], weekday: TUESDAY, fromKey: "2026-11-16", toKey: "2026-12-11" });
    expect(plan.create).toEqual([
      { dateKey: "2026-11-17", off: false },
      { dateKey: "2026-11-24", off: true },
      { dateKey: "2026-12-01", off: false },
      { dateKey: "2026-12-08", off: true },
    ]);
  });
  it("is idempotent", () => {
    const existing = ["2026-11-17", "2026-11-24"].map((dateKey) => ({ id: dateKey, dateKey, shiftable: true }));
    expect(planRegularDates({ existing, weekday: TUESDAY, fromKey: "2026-11-16", toKey: "2026-11-27" })).toEqual({
      create: [],
      shift: [],
      stay: [],
    });
  });
  it("shifts shiftable dates inside their week and leaves the rest", () => {
    const plan = planRegularDates({
      existing: [
        { id: "a", dateKey: "2026-11-17", shiftable: true },
        { id: "started", dateKey: "2026-11-10", shiftable: false },
        { id: "moved", dateKey: "2026-12-03", movedFromDateKey: "2026-12-01", shiftable: false },
      ],
      weekday: THURSDAY,
      fromKey: "2026-11-09",
      toKey: "2026-12-04",
    });
    expect(plan.shift).toEqual([{ id: "a", dateKey: "2026-11-19" }]);
    expect(plan.stay).toEqual([]);
    expect(plan.create.map((row) => row.dateKey)).toEqual(["2026-11-26"]);
  });
  it("never rebuilds a week whose date moved out of it", () => {
    const plan = planRegularDates({
      existing: [{ id: "moved", dateKey: "2026-11-25", movedFromDateKey: "2026-11-17", shiftable: false }],
      weekday: TUESDAY,
      fromKey: "2026-11-16",
      toKey: "2026-11-20",
    });
    expect(plan.create).toEqual([]);
  });
  it("leaves a date alone when its week has no slot left", () => {
    const plan = planRegularDates({
      existing: [{ id: "thu", dateKey: "2026-11-19", shiftable: true }],
      weekday: TUESDAY,
      fromKey: "2026-11-18",
      toKey: "2026-11-27",
    });
    expect(plan.stay).toEqual(["thu"]);
    expect(plan.create.map((row) => row.dateKey)).toEqual(["2026-11-24"]);
  });
});

describe("deriveQuarterState", () => {
  const finished = { status: "booked", hashStatus: "finished" } as const;
  const upcoming = { status: "booked", hashStatus: "scheduled" } as const;

  it.each([
    [{ bookings: [], standing: null }, "needs_hash"],
    [{ bookings: [], standing: "no_dates_work" }, "no_dates_work"],
    [{ bookings: [upcoming], standing: "no_dates_work" }, "booked"],
    [{ bookings: [{ status: "needs_confirmation", hashStatus: "scheduled" }], standing: null }, "booked"],
    [{ bookings: [upcoming], standing: "exempt" }, "exempt"],
    [{ bookings: [finished], standing: "exempt" }, "done"],
    [{ bookings: [finished, upcoming], standing: null }, "done"],
    [{ bookings: [{ status: "needs_confirmation", hashStatus: "finished" }], standing: null }, "needs_hash"],
  ] as const)("%j is %s", (input, expected) => {
    expect(deriveQuarterState(input)).toBe(expected);
  });
});

describe("isLapsed", () => {
  it("is a date that passed without starting", () => {
    expect(isLapsed({ status: "scheduled", dateKey: "2026-11-03" }, "2026-11-04")).toBe(true);
    expect(isLapsed({ status: "scheduled", dateKey: "2026-11-03" }, "2026-11-03")).toBe(false);
    expect(isLapsed({ status: "finished", dateKey: "2026-11-03" }, "2026-11-04")).toBe(false);
  });
});

describe("fillFromAvailability", () => {
  const dates = [
    { id: "d1", openSpots: 1 },
    { id: "d2", openSpots: 2 },
  ];

  it("places the fewest answers first so flexible people yield", () => {
    const result = fillFromAvailability({
      people: ["flex", "only-d1"],
      dates,
      canAnswers: [
        { userId: "flex", dateId: "d1" },
        { userId: "flex", dateId: "d2" },
        { userId: "only-d1", dateId: "d1" },
      ],
    });
    expect(result.placements).toEqual([
      { userId: "only-d1", dateId: "d1" },
      { userId: "flex", dateId: "d2" },
    ]);
    expect(result.unplaced).toEqual([]);
  });
  it("respects capacity and reports who didn't fit", () => {
    const result = fillFromAvailability({
      people: ["a", "b"],
      dates: [{ id: "d1", openSpots: 1 }],
      canAnswers: [
        { userId: "a", dateId: "d1" },
        { userId: "b", dateId: "d1" },
      ],
    });
    expect(result.placements).toEqual([{ userId: "a", dateId: "d1" }]);
    expect(result.unplaced).toEqual(["b"]);
  });
  it("gives one spot per person", () => {
    const result = fillFromAvailability({
      people: ["a", "a"],
      dates,
      canAnswers: [
        { userId: "a", dateId: "d1" },
        { userId: "a", dateId: "d2" },
      ],
    });
    expect(result.placements).toEqual([{ userId: "a", dateId: "d1" }]);
  });
  it("leaves full dates alone, and people with no answers unplaced", () => {
    const result = fillFromAvailability({
      people: ["a", "b"],
      dates: [{ id: "full", openSpots: 0 }],
      canAnswers: [{ userId: "a", dateId: "full" }],
    });
    expect(result.placements).toEqual([]);
    expect(result.unplaced).toEqual(["a", "b"]);
  });
});

describe("checklist seed", () => {
  const areas = flattenChecklist(HASHING_CHECKLIST_SEED);

  it("has the owner's counts", () => {
    expect(Object.fromEntries(areas.map((area) => [area.name, area.total]))).toEqual({
      "Large Packout": 35,
      "Medium Packout": 36,
      "LX Packout": 18,
      "Mic stands & 35mm stands": 7,
      "Speakers & black shelf": 18,
      "Red shelf": 18,
      "Misc & wrap-up": 8,
    });
    expect(areas.reduce((sum, area) => sum + area.total, 0)).toBe(140);
  });
  it("is publishable and gives every row a unique key", () => {
    expect(checklistProblems(HASHING_CHECKLIST_SEED)).toEqual([]);
    const keys = areas.flatMap((area) => [
      ...area.kits.flatMap((kit) => kit.rows),
      ...area.finalChecks,
    ]);
    expect(new Set(keys.map((row) => row.itemKey)).size).toBe(140);
  });
  it("shares four kits between Large and Medium, with an extra on the Medium event kit", () => {
    const [large, medium] = HASHING_CHECKLIST_SEED.areas;
    const shared = large!.placements
      .map((placement) => placement.kitId)
      .filter((kitId) => medium!.placements.some((placement) => placement.kitId === kitId));
    expect(shared).toEqual(["event-kit", "xlr-pack", "iec-pack", "power-crate-a"]);
    expect(areas[1]!.kits[0]!.rows.at(-1)?.text).toBe("Has tablet and is charged");
    expect(areas[0]!.kits[0]!.rows).toHaveLength(11);
  });
  it("applies the owner's fixes", () => {
    const text = JSON.stringify(HASHING_CHECKLIST_SEED);
    expect(text).toContain("Has Naloxone");
    expect(text).toContain("Keyboard is in good condition");
    expect(text).toContain("x2 SM58");
    expect(text).toContain("Replace any cable ties");
    expect(text).not.toMatch(/Nalaxone|Keybaord|it's|\*\*/);
    expect(text.match(/Has x2 SM57/g)).toBeNull();
  });
  it("keeps Misc & wrap-up last", () => {
    expect(areas.at(-1)?.name).toBe("Misc & wrap-up");
  });
});

describe("flattenChecklist", () => {
  it("keeps a shared kit's item separate per area", () => {
    const areas = flattenChecklist(HASHING_CHECKLIST_SEED);
    expect(areas[0]!.kits[0]!.rows[0]!.itemKey).toBe("large-packout:event-kit:event-kit-1");
    expect(areas[1]!.kits[0]!.rows[0]!.itemKey).toBe("medium-packout:event-kit:event-kit-1");
    expect(areas[0]!.finalChecks[0]!.itemKey).toBe("large-packout:final:large-final-1");
  });
  it("limits to the chosen areas", () => {
    expect(flattenChecklist(HASHING_CHECKLIST_SEED, ["red-shelf"]).map((area) => area.id)).toEqual(["red-shelf"]);
  });
});

describe("checklistProblems", () => {
  it("names what's wrong", () => {
    expect(
      checklistProblems({
        kits: [{ id: "lonely", name: "Lonely", items: [{ id: "a", text: " " }] }],
        areas: [{ id: "empty", name: "Empty", placements: [], finalChecks: [] }],
      }),
    ).toEqual(["Lonely has an empty item.", "Lonely isn't in any area.", "Empty has nothing to check."]);
  });
  it("refuses a kit id that would collide with final checks, or a colon in an id", () => {
    const problems = checklistProblems({
      kits: [{ id: "final", name: "Final", items: [{ id: "a:b", text: "x" }] }],
      areas: [
        { id: "a", name: "A", placements: [{ kitId: "final", extraItems: [] }], finalChecks: [] },
      ],
    });
    expect(problems).toEqual(['"final" is reserved for final checks.', "Final has an invalid id: a:b."]);
  });
});

describe("holdsQuarterSpot", () => {
  const today = "2026-11-10";
  it("frees lapsed dates and no-shows, and keeps everything else", () => {
    expect(holdsQuarterSpot({ status: "booked" }, { status: "scheduled", dateKey: "2026-11-03" }, today)).toBe(false);
    expect(
      holdsQuarterSpot({ status: "needs_confirmation" }, { status: "finished", dateKey: "2026-11-03" }, today),
    ).toBe(false);
    expect(holdsQuarterSpot({ status: "booked" }, { status: "finished", dateKey: "2026-11-03" }, today)).toBe(true);
    expect(
      holdsQuarterSpot({ status: "needs_confirmation" }, { status: "scheduled", dateKey: "2026-11-17" }, today),
    ).toBe(true);
  });
});
