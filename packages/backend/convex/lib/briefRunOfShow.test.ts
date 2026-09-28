import { describe, expect, it } from "vitest";
import { buildBriefRunOfShow, type BriefBlockRow, type BriefShiftRow } from "./briefRunOfShow";

const HOUR = 60 * 60_000;
const base = Date.UTC(2026, 9, 14, 0, 0);
/** "17:30" on the event day (day 0) or a later day. */
const at = (time: string, day = 0) => {
  const [h, m] = time.split(":").map(Number);
  return base + day * 24 * HOUR + h! * HOUR + m! * 60_000;
};
const hhmm = (ms: number) => new Date(ms).toISOString().slice(11, 16);

let counter = 0;
function block(
  blockType: BriefBlockRow["blockType"],
  label: string,
  start: string,
  end: string,
  extra: Partial<BriefBlockRow> = {},
): BriefBlockRow {
  counter += 1;
  return {
    _id: `b${counter}`,
    blockType,
    label,
    dayIndex: 0,
    startsAt: at(start, extra.dayIndex),
    endsAt: at(end, extra.dayIndex),
    ...extra,
  };
}

const options = {
  formatTime: hhmm,
  formatDate: (ms: number) => new Date(ms).toISOString().slice(0, 10),
  swaps: (from: string, to: string) =>
    from === "Larks" && to === "Night Owls" ? ["A.1 Sax → Gtr"] : undefined,
};

describe("buildBriefRunOfShow", () => {
  const setup = block("setup", "Load-in", "15:00", "18:00");
  const show = block("show", "Show", "18:00", "22:00");
  const soundcheck = block("soundcheck", "Night Owls soundcheck", "17:00", "17:30", { participationId: "owls" });
  const doors = block("doors", "Doors", "18:00", "18:30");
  const larksSet = block("set", "Larks set", "18:30", "19:15", { needId: "larks" });
  const changeover = block("changeover", "Changeover to Night Owls", "19:15", "19:30");
  const owlsSet = block("set", "Night Owls set", "19:30", "20:30", { participationId: "owls" });
  const stray = block("custom", "Afterparty", "23:00", "23:30");
  const straySoundcheck = block("soundcheck", "Larks soundcheck", "14:00", "14:15", { needId: "larks" });

  const shifts: BriefShiftRow[] = [
    { scheduleBlockId: show._id, role: "FOH", personName: "Alex", startsAt: at("18:00"), endsAt: at("22:00"), callTime: at("17:30") },
    { scheduleBlockId: show._id, role: "Stagehand", startsAt: at("18:00"), endsAt: at("22:00") },
    { scheduleBlockId: doors._id, role: "Door", personName: "Kai", startsAt: at("18:00"), endsAt: at("18:30") },
    { role: "Runner", personName: "Mo", startsAt: at("16:00"), endsAt: at("17:00") },
  ];

  const result = buildBriefRunOfShow(
    [owlsSet, stray, show, doors, changeover, straySoundcheck, setup, larksSet, soundcheck],
    shifts,
    options,
  );
  const [day] = result.runOfShow;

  it("nests moments in their section and keeps stray moments on their own", () => {
    expect(result.runOfShow).toHaveLength(1);
    expect(day!.dayLabel).toBeUndefined();
    expect(
      day!.entries.map((entry) =>
        entry.section ? `${entry.section.label}: ${entry.moments.map((m) => m.label).join(", ")}` : `(${entry.moments[0]!.label})`,
      ),
    ).toEqual([
      "(Larks)",
      "Load-in: Night Owls",
      "Show: Doors, Larks, Changeover to Night Owls, Night Owls",
      "Afterparty: ",
    ]);
  });

  it("puts crew under their section, flags open slots, and shows call times", () => {
    const showEntry = day!.entries.find((entry) => entry.section?.label === "Show")!;
    expect(showEntry.section!.crew).toEqual([
      { role: "FOH", person: "Alex", timeLabel: "Call 17:30 · 18:00 – 22:00", notes: undefined, open: false },
      { role: "Stagehand", person: "Open", timeLabel: "18:00 – 22:00", notes: undefined, open: true },
    ]);
    // A shift on a moment (doors) or with no block is not section crew.
    expect(result.otherShifts.map((shift) => shift.role)).toEqual(["Runner", "Door"]);
  });

  it("puts the night rider's cable swaps on the changeover between two sets", () => {
    const showEntry = day!.entries.find((entry) => entry.section?.label === "Show")!;
    expect(showEntry.moments.find((m) => m.typeLabel === "Changeover")).toMatchObject({
      startLabel: "19:15",
      durationLabel: "15m",
      swaps: ["A.1 Sax → Gtr"],
    });
    expect(showEntry.moments.find((m) => m.typeLabel === "Doors")!.swaps).toBeUndefined();
  });

  it("lists acts in show order with their soundcheck and set", () => {
    expect(result.acts).toEqual([
      { name: "Larks", soundcheckLabel: "14:00 – 14:15", setLabel: "18:30 – 19:15" },
      { name: "Night Owls", soundcheckLabel: "17:00 – 17:30", setLabel: "19:30 – 20:30" },
    ]);
  });

  it("labels days on a multi-day event", () => {
    const multi = buildBriefRunOfShow(
      [block("show", "Night one", "18:00", "22:00"), block("show", "Night two", "18:00", "22:00", { dayIndex: 1 })],
      [],
      options,
    );
    expect(multi.runOfShow.map((d) => d.dayLabel)).toEqual(["Day 1 · 2026-10-14", "Day 2 · 2026-10-15"]);
  });

  it("pairs a changeover only with sets on its own day", () => {
    const nightOne = block("set", "Larks set", "20:00", "21:00", { needId: "larks" });
    const changeover = block("changeover", "Changeover", "18:45", "19:00", { dayIndex: 1 });
    const nightTwo = block("set", "Night Owls set", "19:00", "20:00", { participationId: "owls", dayIndex: 1 });
    const result = buildBriefRunOfShow([nightOne, changeover, nightTwo], [], options);
    const moments = result.runOfShow.flatMap((day) => day.entries.flatMap((entry) => entry.moments));
    // Without the same-day rule, night one's Larks set would pair with night two's Night Owls.
    expect(moments.find((m) => m.typeLabel === "Changeover")!.swaps).toBeUndefined();
  });

  it("marks a shift with an assignee but no stored name as Assigned, not Open", () => {
    const section = block("show", "Show", "18:00", "22:00");
    const result = buildBriefRunOfShow(
      [section],
      [
        { scheduleBlockId: section._id, role: "A2", userId: "user-1", startsAt: at("18:00"), endsAt: at("22:00") },
        { scheduleBlockId: section._id, role: "Trainee", crewApplicationId: "app-1", startsAt: at("18:00"), endsAt: at("22:00") },
      ],
      options,
    );
    const crew = result.runOfShow[0]!.entries[0]!.section!.crew;
    expect(crew.map((shift) => [shift.person, shift.open])).toEqual([
      ["Assigned", false],
      ["Assigned", false],
    ]);
  });

  it("pairs a changeover across midnight on the same night", () => {
    const late = block("set", "Larks set", "22:00", "23:59", { needId: "larks" });
    // 12:05–12:30 AM and 12:30–1:30 AM: next calendar day, so dayIndex 1.
    const changeover = block("changeover", "Changeover", "00:05", "00:30", { dayIndex: 1 });
    const afterMidnight = block("set", "Night Owls set", "00:30", "01:30", {
      participationId: "owls",
      dayIndex: 1,
    });
    const result = buildBriefRunOfShow([late, changeover, afterMidnight], [], options);
    const moments = result.runOfShow.flatMap((day) => day.entries.flatMap((entry) => entry.moments));
    expect(moments.find((m) => m.typeLabel === "Changeover")!.swaps).toEqual(["A.1 Sax → Gtr"]);
  });
});
