import { describe, expect, it } from "vitest";
import { pacificDateAndTimeToMs } from "@/lib/format";
import {
  clipToNight,
  formatWindowList,
  isOnNight,
  mergeBusyNotes,
  mergeWindows,
  nightAnswerArgs,
  partDraftFromWindows,
  partFreeWindows,
} from "./crew-nights";

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

describe("sections on another day", () => {
  const DAY_BEFORE = "2026-10-15";
  const before = (time: string) => pacificDateAndTimeToMs(DAY_BEFORE, time)!;
  const setup = { startsAt: at("17:30"), endsAt: at("19:00") };
  const strike = { startsAt: at("21:00"), endsAt: at("21:30") };
  const lateStrike = { startsAt: at("22:30"), endsAt: pacificDateAndTimeToMs("2026-10-17", "00:30")! };
  const loadInDayBefore = { startsAt: before("17:30"), endsAt: before("19:00") };

  const NEXT = "2026-10-17";
  const overnightStrike = {
    startsAt: pacificDateAndTimeToMs(NEXT, "02:00")!,
    endsAt: pacificDateAndTimeToMs(NEXT, "07:00")!,
  };

  it("keeps the night's own sections, past midnight and 6 AM included, and leaves out other days", () => {
    expect(isOnNight(NIGHT, setup)).toBe(true);
    expect(isOnNight(NIGHT, lateStrike)).toBe(true);
    expect(isOnNight(NIGHT, overnightStrike)).toBe(true);
    expect(isOnNight(NIGHT, loadInDayBefore)).toBe(false);
    expect(isOnNight(NIGHT, { startsAt: pacificDateAndTimeToMs(NEXT, "06:00")!, endsAt: pacificDateAndTimeToMs(NEXT, "08:00")! })).toBe(false);
  });

  it("an overnight strike past 6 AM round-trips through the times", () => {
    const draft = partDraftFromWindows([overnightStrike])!;
    expect(draft).toEqual({ from: "02:00", to: "07:00", busy: [] });
    expect(partFreeWindows(NIGHT, draft.from, draft.to, draft.busy)).toMatchObject({ free: [overnightStrike] });
  });

  it("clips saved windows to the night", () => {
    expect(clipToNight(NIGHT, [loadInDayBefore, setup, overnightStrike])).toEqual([setup, overnightStrike]);
    expect(clipToNight(NIGHT, [{ startsAt: before("20:00"), endsAt: at("19:00") }])).toEqual([
      { startsAt: pacificDateAndTimeToMs(NIGHT, "06:00")!, endsAt: at("19:00") },
    ]);
  });

  it("setup 5:30–7 plus strike 9–9:30 round-trips through the times", () => {
    const draft = partDraftFromWindows(mergeWindows([setup, strike]))!;
    expect(draft).toEqual({ from: "17:30", to: "21:30", busy: [{ start: "19:00", end: "21:00" }] });
    expect(partFreeWindows(NIGHT, draft.from, draft.to, draft.busy)).toMatchObject({ free: [setup, strike] });
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
