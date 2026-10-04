import { describe, expect, it } from "vitest";
import {
  describeHeadcount,
  groupCrewBySection,
  parseCrewLine,
  sumCrewAmountUsd,
  type CrewLineInput,
} from "./crew-sections";

function line(label: string, hours: number, rateUsd: number, extra: Partial<CrewLineInput> = {}) {
  return {
    id: `${label}-${hours}-${rateUsd}`,
    label,
    quantity: hours,
    rateUsd,
    amountUsd: Number((hours * rateUsd).toFixed(2)),
    ...extra,
  } satisfies CrewLineInput;
}

describe("parseCrewLine", () => {
  it("reads section, role, person and the lead tag", () => {
    expect(
      parseCrewLine(line("Load-in — Sound engineer (Maximiliano Fernández-Castellanos (Lead))", 3, 35)),
    ).toMatchObject({
      section: "Load-in",
      role: "Sound engineer",
      person: "Maximiliano Fernández-Castellanos",
      lead: true,
      openSlot: false,
      people: 1,
      hoursEach: 3,
    });
  });

  it("reads open slots, role-less shifts and day prefixes", () => {
    expect(parseCrewLine(line("Day 2 — Strike — Stagehand (Open slot)", 2, 22))).toMatchObject({
      day: "Day 2",
      section: "Strike",
      role: "Stagehand",
      openSlot: true,
    });
    expect(parseCrewLine(line("Show — Alex Kim (Lead)", 4, 35))).toMatchObject({
      section: "Show",
      person: "Alex Kim",
      lead: true,
    });
    expect(parseCrewLine(line("Show — Open slot", 4, 25))).toMatchObject({ openSlot: true });
  });

  it("keeps parentheses inside a role", () => {
    expect(parseCrewLine(line("Show — A1 (FOH) (Priya Natarajan)", 4, 25))).toMatchObject({
      role: "A1 (FOH)",
      person: "Priya Natarajan",
    });
  });

  it("treats hand-entered rows as people × hours under their own label", () => {
    expect(
      parseCrewLine(
        line("Extra hands — load-out", 3, 22, { memberCount: 2, performanceHours: 1.5, crewSource: "manual" }),
      ),
    ).toMatchObject({ manualLabel: "Extra hands — load-out", people: 2, hoursEach: 1.5 });
  });

  it("files a hand-entered row under its day when the label starts with one", () => {
    expect(
      parseCrewLine(
        line("Day 2 — Extra hands", 3, 22, { memberCount: 2, performanceHours: 1.5, crewSource: "manual" }),
      ),
    ).toMatchObject({ day: "Day 2", manualLabel: "Extra hands", people: 2 });
  });

  it("shows an unrecognised label as the role", () => {
    const parsed = parseCrewLine(line("Stage manager", 5, 30));
    expect(parsed.role).toBe("Stage manager");
    expect(parsed.person).toBeUndefined();
  });
});

describe("groupCrewBySection", () => {
  const lines = [
    line("Day 1 — Load-in — Sound engineer (Ana (Lead))", 3, 35),
    line("Day 1 — Load-in — Stagehand (Open slot)", 3, 22),
    line("Day 1 — Load-in — Stagehand (Jo)", 4, 22),
    line("Day 1 — Show — Sound engineer (Ana (Lead))", 4.5, 35),
    line("Day 2 — Load-in — Sound engineer (Ana (Lead))", 3, 35),
    line("Extra hands", 3, 22, { memberCount: 2, performanceHours: 1.5, crewSource: "manual" }),
    // Odd cents, so a float sum would drift.
    line("Day 2 — Show — Lighting (Sam)", 3.33, 25.01),
  ].map(parseCrewLine);

  it("groups by day then section in quote order, with hand-entered rows last", () => {
    const days = groupCrewBySection(lines);
    expect(days.map((day) => day.title)).toEqual(["Day 1", "Day 2", "Other crew"]);
    expect(days[0]!.groups.map((group) => group.title)).toEqual(["Load-in", "Show"]);
    expect(days[2]!.groups.map((group) => group.title)).toEqual(["Extra hands"]);
  });

  it("keeps headcount per phase instead of flattening it", () => {
    const [day1] = groupCrewBySection(lines);
    expect(describeHeadcount(day1!.groups[0]!.lines)).toBe("2 people × 3 hrs + 1 person × 4 hrs");
    expect(describeHeadcount(day1!.groups[1]!.lines)).toBe("1 person × 4.5 hrs");
  });

  it("adds every group up to exactly the billed lines", () => {
    const days = groupCrewBySection(lines);
    const billedCents = lines.reduce((sum, row) => sum + Math.round(row.amountUsd * 100), 0);
    const groupCents = days
      .flatMap((day) => day.groups)
      .reduce((sum, group) => sum + Math.round(group.amountUsd * 100), 0);
    const dayCents = days.reduce((sum, day) => sum + Math.round(day.amountUsd * 100), 0);
    expect(groupCents).toBe(billedCents);
    expect(dayCents).toBe(billedCents);
    expect(sumCrewAmountUsd(lines)).toBe(billedCents / 100);
    expect(days.flatMap((day) => day.groups).flatMap((group) => group.lines)).toHaveLength(lines.length);
  });

  it("has no day headings on a single-day quote", () => {
    const days = groupCrewBySection([parseCrewLine(line("Show — Sound (Ana)", 4, 25))]);
    expect(days).toHaveLength(1);
    expect(days[0]!.title).toBeUndefined();
  });
});
