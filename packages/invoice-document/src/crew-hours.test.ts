import { describe, expect, it } from "vitest";
import {
  allocateCrewHours,
  crewCountableHours,
  crewPersonKeys,
  crewTierMultiplier,
  crewTierTag,
  overlappingCrewShiftIds,
  type CrewOverlapShift,
  type CrewShiftForPeople,
} from "./crew-hours";

const H = 3_600_000;
const sections = { setup: 0, show: 2 * H, strike: 8 * H };

function slots(section: keyof typeof sections, count: number, extra: Partial<CrewShiftForPeople> = {}) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${section}-${index}`,
    day: "d1",
    sectionRef: section,
    sectionStartsAt: sections[section],
    role: "Crew",
    startsAt: sections[section],
    ...extra,
  }));
}

describe("crewPersonKeys", () => {
  it("keeps the same people across sections and adds people only where headcount grows", () => {
    const keys = crewPersonKeys([...slots("setup", 2), ...slots("show", 2), ...slots("strike", 3)]);
    const people = new Map<string, string[]>();
    for (const [shift, person] of keys) people.set(person, [...(people.get(person) ?? []), shift]);
    expect([...people.values()].map((shifts) => shifts.length).sort()).toEqual([1, 3, 3]);
  });

  it("keeps an early setup crew on when they stay, and adds people when they leave mid-setup", () => {
    const early = (count: number, hours: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `early-${index}`,
        day: "d1",
        sectionRef: "early",
        sectionStartsAt: -H,
        role: "Crew",
        startsAt: -H,
        hours,
      }));
    const rest = [
      ...slots("setup", 2, { hours: 2 }),
      ...slots("show", 2, { hours: 6 }),
      ...slots("strike", 2, { hours: 1 }),
    ];
    const peopleCount = (keys: Map<string, string>) => new Set(keys.values()).size;

    // Early setup until setup starts: the same two people all night.
    const stays = crewPersonKeys([...early(2, 1), ...rest]);
    expect(peopleCount(stays)).toBe(2);
    expect(stays.get("early-0")).toBe(stays.get("strike-0"));

    // Early setup until soundcheck (inside setup): they leave, the setup crew carry on.
    const leaves = crewPersonKeys([...early(2, 2.5), ...rest]);
    expect(peopleCount(leaves)).toBe(4);
    expect(leaves.get("early-0")).not.toBe(leaves.get("setup-0"));
    expect(leaves.get("setup-0")).toBe(leaves.get("strike-0"));
  });

  it("matches assigned crew by who they are, and roles separately", () => {
    const keys = crewPersonKeys([
      ...slots("setup", 1, { userId: "alex" }),
      ...slots("strike", 1, { userId: "alex" }),
      { ...slots("setup", 1)[0]!, id: "light", role: "Lighting" },
      { ...slots("setup", 1)[0]!, id: "sound", role: "Sound" },
    ]);
    expect(keys.get("setup-0")).toBe(keys.get("strike-0"));
    expect(keys.get("light")).not.toBe(keys.get("sound"));
  });
});

describe("allocateCrewHours", () => {
  it("fills 8 regular hours a day, the rest past a full day", () => {
    const result = allocateCrewHours([
      { id: "a", personKey: "p", startsAt: 0, hours: 2 },
      { id: "b", personKey: "p", startsAt: 2, hours: 6 },
      { id: "c", personKey: "p", startsAt: 8, hours: 2 },
      { id: "d", personKey: "q", startsAt: 8, hours: 2 },
    ]);
    expect(result.get("c")).toEqual({ regularHours: 0, pastRegularHours: 2 });
    expect(result.get("d")).toEqual({ regularHours: 2, pastRegularHours: 0 });
  });
});

describe("crew tiers", () => {
  it("bills 1× / 1.5× on a normal day and 1.5× / 2× on an OT day", () => {
    expect([crewTierMultiplier("regular", false), crewTierMultiplier("past_regular", false)]).toEqual([1, 1.5]);
    expect([crewTierMultiplier("regular", true), crewTierMultiplier("past_regular", true)]).toEqual([1.5, 2]);
    expect(crewTierTag("past_regular", true)).toBe(" · DT after 8 hrs");
  });
});

describe("crewCountableHours", () => {
  /** A shift for one person from hour `from` to hour `to` (7pm = 19). */
  function shift(id: string, from: number, to: number, extra: Partial<CrewOverlapShift> = {}): CrewOverlapShift {
    return { id, userId: "u1", startsAt: from * H, endsAt: to * H, hours: to - from, ...extra };
  }

  it("leaves shifts that don't overlap alone", () => {
    const result = crewCountableHours([shift("a", 17, 19), shift("b", 19, 21)]);
    expect([result.get("a"), result.get("b")]).toEqual([2, 2]);
  });

  it("counts shared time once, on the shift that starts first (7–8pm and 7:45–9pm is 2 hrs)", () => {
    // Created first, but 7:45 starts later: it only counts 8–9pm.
    const result = crewCountableHours([shift("b", 19.75, 21, { createdAt: 1 }), shift("a", 19, 20, { createdAt: 2 })]);
    expect([result.get("a"), result.get("b")]).toEqual([1, 1]);
  });

  it("counts a shift inside an earlier one as zero", () => {
    const result = crewCountableHours([shift("a", 18, 22), shift("b", 19, 20)]);
    expect([result.get("a"), result.get("b")]).toEqual([4, 0]);
  });

  it("counts a three-way overlap once", () => {
    const result = crewCountableHours([shift("a", 18, 20), shift("b", 19, 21), shift("c", 19.5, 22)]);
    // a: 18–20, b: only 20–21 is new, c: only 21–22 is new.
    expect([result.get("a"), result.get("b"), result.get("c")]).toEqual([2, 1, 1]);
  });

  it("gives a tie on start to the earlier-created shift, else the lower id", () => {
    const byCreation = crewCountableHours([shift("a", 19, 21, { createdAt: 5 }), shift("b", 19, 20, { createdAt: 3 })]);
    expect([byCreation.get("b"), byCreation.get("a")]).toEqual([1, 1]);
    const unsaved = crewCountableHours([shift("a", 19, 21), shift("b", 19, 20, { createdAt: 3 })]);
    expect([unsaved.get("b"), unsaved.get("a")]).toEqual([1, 1]);
    const byId = crewCountableHours([shift("b", 19, 21), shift("a", 19, 20)]);
    expect([byId.get("a"), byId.get("b")]).toEqual([1, 1]);
  });

  it("never lets a cancelled event's shift cover anyone's time", () => {
    const result = crewCountableHours([shift("a", 18, 20, { cancelled: true }), shift("b", 19, 21)]);
    expect([result.get("a"), result.get("b")]).toEqual([2, 2]);
  });

  it("only removes the overlap from custom hours, never below zero", () => {
    const result = crewCountableHours([shift("a", 19, 20), shift("b", 19.5, 21, { hours: 0.25 })]);
    expect(result.get("b")).toBe(0);
  });

  it("only matches assigned people, and only the same person", () => {
    const result = crewCountableHours([
      shift("a", 19, 21),
      shift("b", 19, 21, { userId: "u2" }),
      shift("c", 19, 21, { userId: undefined }),
      shift("d", 19, 21, { userId: undefined }),
    ]);
    expect([...result.values()]).toEqual([2, 2, 2, 2]);
  });

  it("flags the shifts that overlap another of the same person", () => {
    const ids = overlappingCrewShiftIds([shift("a", 18, 22), shift("b", 19, 20), shift("c", 22, 23), shift("d", 19, 20, { userId: "u2" })]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });
});
