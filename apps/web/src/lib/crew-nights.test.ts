import { describe, expect, it } from "vitest";
import { pacificDateAndTimeToMs } from "@/lib/format";
import { formatWindowList, mergeBusyNotes, nightAnswerArgs, partDraftFromWindows, partFreeWindows } from "./crew-nights";

const NIGHT = "2026-10-16";
const at = (time: string) => pacificDateAndTimeToMs(NIGHT, time)!;

describe("nightAnswerArgs", () => {
  const windows = [{ startsAt: 1, endsAt: 2 }];

  it.each([
    ["free", { status: "free", windows: undefined, earlySetupOnly: undefined }],
    ["backup", { status: "backup", windows: undefined, earlySetupOnly: undefined }],
    ["no", { status: "no", windows: undefined, earlySetupOnly: undefined }],
    ["part", { status: "partial", windows, earlySetupOnly: undefined }],
    ["early", { status: "partial", windows: undefined, earlySetupOnly: true }],
  ] as const)("maps %s", (choice, expected) => {
    expect(nightAnswerArgs(NIGHT, choice, windows, "  Late  ")).toEqual({ nightKey: NIGHT, notes: "Late", ...expected });
  });

  it("drops a blank note", () => {
    expect(nightAnswerArgs(NIGHT, "free", undefined, "   ").notes).toBeUndefined();
  });
});

describe("mergeBusyNotes", () => {
  it("adds busy notes without repeating one", () => {
    expect(mergeBusyNotes("Class · Dinner", ["Dinner", "Rehearsal"])).toBe("Class · Dinner · Rehearsal");
  });
});

describe("partFreeWindows", () => {
  it("cuts a busy block out of the free range (from 2:30, meeting 4–5)", () => {
    const result = partFreeWindows(NIGHT, "14:30", "23:00", [{ start: "16:00", end: "17:00" }]);
    expect(result).toEqual({
      free: [
        { startsAt: at("14:30"), endsAt: at("16:00") },
        { startsAt: at("17:00"), endsAt: at("23:00") },
      ],
      busy: [{ startsAt: at("16:00"), endsAt: at("17:00") }],
    });
  });

  it("skips blank busy rows and flags half-filled ones", () => {
    expect(partFreeWindows(NIGHT, "18:00", "22:00", [{ start: "", end: "" }])).toMatchObject({
      free: [{ startsAt: at("18:00"), endsAt: at("22:00") }],
    });
    expect(partFreeWindows(NIGHT, "18:00", "22:00", [{ start: "19:00", end: "" }])).toHaveProperty("error");
  });

  it("refuses an answer with no free time left", () => {
    expect(partFreeWindows(NIGHT, "18:00", "20:00", [{ start: "17:00", end: "21:00" }])).toHaveProperty("error");
  });
});

describe("partDraftFromWindows", () => {
  it("turns saved windows back into from–to and the gaps as busy blocks", () => {
    expect(
      partDraftFromWindows([
        { startsAt: at("17:00"), endsAt: at("23:00") },
        { startsAt: at("14:30"), endsAt: at("16:00") },
      ]),
    ).toEqual({ from: "14:30", to: "23:00", busy: [{ start: "16:00", end: "17:00" }] });
    expect(partDraftFromWindows([])).toBeNull();
  });
});

describe("formatWindowList", () => {
  it("joins windows into one readable line", () => {
    const line = formatWindowList([
      { startsAt: at("14:30"), endsAt: at("16:00") },
      { startsAt: at("17:00"), endsAt: at("23:00") },
    ]);
    expect(line).toContain(" and ");
  });
});
