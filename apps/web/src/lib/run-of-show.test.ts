import { describe, expect, it } from "vitest";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import { localDateTimeInputToMs } from "@/lib/crew-availability";
import type { EventShiftDraft } from "@/lib/event-schedule-draft";
import { mergeServerActBlocks } from "@/lib/event-schedule-draft";
import {
  buildRunOfShow,
  changeoverNeighbors,
  nestRunOfShow,
  runOfShowIssues,
  type RunOfShowAct,
} from "./run-of-show";

let counter = 0;
function block(
  blockType: TimelineBlockDraft["blockType"],
  startsAt: string,
  endsAt: string,
  extra: Partial<TimelineBlockDraft> = {},
): TimelineBlockDraft {
  counter += 1;
  return {
    id: `b${counter}`,
    clientId: `b${counter}`,
    blockType,
    label: blockType,
    dayIndex: 0,
    startsAt: `2026-10-12T${startsAt}`,
    endsAt: `2026-10-12T${endsAt}`,
    notes: "",
    ...extra,
  };
}

const owls: RunOfShowAct = { key: "p:owls", name: "Night Owls", participationId: "owls", open: false };
const larks: RunOfShowAct = { key: "p:larks", name: "Larks", participationId: "larks", open: false };
const tba: RunOfShowAct = { key: "n:slot3", name: "TBA", needId: "slot3", open: true };

const actName = (b: TimelineBlockDraft) =>
  b.participationId === "owls" ? "Night Owls" : b.participationId === "larks" ? "Larks" : undefined;

describe("nestRunOfShow", () => {
  it("nests moments inside the latest-starting section that contains them", () => {
    const setup = block("setup", "15:00", "18:00");
    const show = block("show", "18:00", "22:00");
    const soundcheck = block("soundcheck", "17:00", "17:30", { participationId: "owls", actOwned: true });
    const set = block("set", "19:00", "20:00", { participationId: "owls", actOwned: true });
    const stray = block("doors", "23:00", "23:15");
    const [day] = nestRunOfShow([set, stray, show, soundcheck, setup]);
    expect(day!.entries.map((entry) => entry.section?.block.blockType ?? "orphan")).toEqual([
      "setup",
      "show",
      "orphan",
    ]);
    expect(day!.entries[0]!.moments.map((m) => m.block)).toEqual([soundcheck]);
    expect(day!.entries[1]!.moments.map((m) => m.block)).toEqual([set]);
  });
});

describe("runOfShowIssues", () => {
  it("flags soundchecks into doors, overlapping sets, and acts without a set", () => {
    const show = block("show", "15:00", "23:00");
    const doors = block("doors", "18:00", "18:30");
    const soundcheck = block("soundcheck", "17:45", "18:15", { participationId: "owls", actOwned: true });
    const setA = block("set", "19:00", "20:00", { participationId: "owls", actOwned: true });
    const setB = block("set", "19:30", "20:30", { participationId: "larks", actOwned: true });
    const issues = runOfShowIssues([show, doors, soundcheck, setA, setB], [owls, larks, tba], { actName });
    expect(issues.byRef.get(soundcheck.clientId!)).toEqual(["Runs into doors (6:00 PM)"]);
    expect(issues.byRef.get(setA.clientId!)).toEqual(["Overlaps Larks set"]);
    expect(issues.byRef.get(setB.clientId!)).toEqual(["Overlaps Night Owls set"]);
    // Open (TBA) slots don't nag for a set time.
    expect(issues.summary).toEqual(["3 items need a look"]);
  });

  it("flags a changeover too short for the night rider's cable swaps", () => {
    const show = block("show", "18:00", "23:00");
    const setA = block("set", "19:00", "20:00", { participationId: "larks", actOwned: true });
    const changeover = block("changeover", "20:00", "20:05");
    const setB = block("set", "20:05", "21:00", { participationId: "owls", actOwned: true });
    const swaps = (from: string, to: string) =>
      from === "Larks" && to === "Night Owls" ? ["A.1 Sax → Gtr", "A.2 Keys → Bass"] : undefined;
    expect(changeoverNeighbors([show, setA, changeover, setB], changeover)).toEqual({
      before: setA,
      after: setB,
    });
    const issues = runOfShowIssues([show, setA, changeover, setB], [owls, larks], { actName, swaps });
    expect(issues.byRef.get(changeover.clientId!)).toEqual(["Tight for 2 cable swaps (~10 min)"]);
  });
});

describe("runOfShowIssues sections", () => {
  it("flags a moment that runs past the end of its section", () => {
    const show = block("show", "18:00", "21:00", { label: "Show" });
    const set = block("set", "20:30", "21:30", { participationId: "owls", actOwned: true });
    const issues = runOfShowIssues([show, set], [owls], { actName });
    expect(issues.byRef.get(set.clientId!)).toEqual(["Runs past the end of Show"]);
    expect(issues.summary).toEqual(["1 item needs a look"]);
  });
});

describe("buildRunOfShow", () => {
  const at = (time: string) => localDateTimeInputToMs(`2026-10-12T${time}`)!;

  it("lays out sets with changeovers, doors, reverse soundchecks, and a show section", () => {
    const setup = block("setup", "15:00", "18:00");
    let n = 0;
    const built = buildRunOfShow(
      [setup],
      {
        playOrder: [
          { act: larks, setMinutes: 45, soundcheckMinutes: 30 },
          { act: owls, setMinutes: 60, soundcheckMinutes: 30 },
        ],
        doorsAt: at("18:00"),
        firstSetAt: at("18:30"),
        changeoverMinutes: 15,
        soundcheckOrder: "reverse",
        eventStartAt: at("15:00"),
      },
      () => `new-${(n += 1)}`,
    );
    const summary = built.map((b) => `${b.startsAt.slice(11)}-${b.endsAt.slice(11)} ${b.blockType} ${b.label}`);
    expect(summary).toEqual([
      "15:00-18:00 setup setup",
      "17:00-17:30 soundcheck Night Owls soundcheck",
      "17:30-18:00 soundcheck Larks soundcheck",
      "18:00-18:30 doors Doors",
      "18:00-20:30 show Show",
      "18:30-19:15 set Larks set",
      "19:15-19:30 changeover Changeover to Night Owls",
      "19:30-20:30 set Night Owls set",
    ]);
    expect(built.find((b) => b.label === "Larks set")).toMatchObject({
      participationId: "larks",
      actOwned: true,
    });
  });

  it("gives each act its own soundcheck length and skips acts with none", () => {
    const oldCheck = block("soundcheck", "17:00", "17:30", { participationId: "larks", actOwned: true });
    const built = buildRunOfShow(
      [oldCheck],
      {
        playOrder: [
          { act: larks, setMinutes: 45, soundcheckMinutes: 0 },
          { act: owls, setMinutes: 60, soundcheckMinutes: 10 },
          { act: tba, setMinutes: 30, soundcheckMinutes: 30 },
        ],
        doorsAt: at("18:00"),
        firstSetAt: at("18:30"),
        changeoverMinutes: 0,
        soundcheckOrder: "reverse",
        eventStartAt: at("17:00"),
      },
      () => "new",
    );
    const checks = built
      .filter((b) => b.blockType === "soundcheck")
      .map((b) => `${b.startsAt.slice(11)}-${b.endsAt.slice(11)} ${b.label}`);
    expect(checks).toEqual(["17:20-17:50 TBA soundcheck", "17:50-18:00 Night Owls soundcheck"]);
  });

  it("reuses an act's existing block ids and drops old doors and changeovers", () => {
    const show = block("show", "18:00", "23:00");
    const oldSet = block("set", "21:00", "22:00", { participationId: "owls", actOwned: true });
    const oldDoors = block("doors", "17:00", "17:30");
    const built = buildRunOfShow(
      [show, oldSet, oldDoors],
      {
        playOrder: [{ act: owls, setMinutes: 60, soundcheckMinutes: 30 }],
        doorsAt: at("19:00"),
        firstSetAt: at("19:30"),
        changeoverMinutes: 15,
        soundcheckOrder: "reverse",
        eventStartAt: at("18:00"),
      },
      () => "new",
    );
    expect(built.filter((b) => b.blockType === "doors")).toHaveLength(1);
    expect(built.find((b) => b.blockType === "set")).toMatchObject({
      id: oldSet.id,
      startsAt: "2026-10-12T19:30",
    });
    // The existing Show section already covers the set, so none is added.
    expect(built.filter((b) => b.blockType === "show")).toEqual([show]);
  });
});

describe("mergeServerActBlocks", () => {
  const act = (id: string, startsAt: string) =>
    ({ ...block("set", startsAt, "21:00", { participationId: "owls", actOwned: true }), id, clientId: id });
  const empty: EventShiftDraft[] = [];

  it("adopts a server change for a block the user has not touched", () => {
    const base = act("s1", "19:00");
    const server = act("s1", "19:30");
    const merged = mergeServerActBlocks({ blocks: [base], shifts: empty }, { blocks: [base], shifts: empty }, [server]);
    expect(merged?.state.blocks).toEqual([server]);
    expect(merged?.baseline.blocks).toEqual([server]);
  });

  it("keeps the user's unsaved edit while updating the baseline", () => {
    const base = act("s1", "19:00");
    const local = act("s1", "19:15");
    const server = act("s1", "19:30");
    const merged = mergeServerActBlocks({ blocks: [local], shifts: empty }, { blocks: [base], shifts: empty }, [server]);
    expect(merged?.state.blocks).toEqual([local]);
    expect(merged?.baseline.blocks).toEqual([server]);
  });

  it("keeps a local deletion and adds blocks new on the server", () => {
    const base = act("s1", "19:00");
    const incoming = act("s2", "20:00");
    const merged = mergeServerActBlocks({ blocks: [], shifts: empty }, { blocks: [base], shifts: empty }, [base, incoming]);
    expect(merged?.state.blocks).toEqual([incoming]);
    expect(merged?.baseline.blocks.map((b) => b.id)).toEqual(["s1", "s2"]);
  });

  it("returns null when nothing changed", () => {
    const base = act("s1", "19:00");
    expect(mergeServerActBlocks({ blocks: [base], shifts: empty }, { blocks: [base], shifts: empty }, [base])).toBeNull();
  });
});
