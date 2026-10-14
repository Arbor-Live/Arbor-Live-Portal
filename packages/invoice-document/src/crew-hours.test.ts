import { describe, expect, it } from "vitest";
import { allocateCrewHours, crewPersonKeys, crewTierMultiplier, crewTierTag, type CrewShiftForPeople } from "./crew-hours";

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
