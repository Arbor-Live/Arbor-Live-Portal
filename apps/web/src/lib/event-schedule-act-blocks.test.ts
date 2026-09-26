import { describe, expect, it } from "vitest";
import type { Id } from "@/lib/convex-api";
import type { TimelineBlockDraft } from "@/components/events/event-timeline-scheduler";
import {
  keepActBlocks,
  rebaseActBlocks,
  reconcileShiftsForReplacedBlocks,
  type EventShiftDraft,
} from "./event-schedule-draft";

function block(partial: Partial<TimelineBlockDraft> & { id: string }): TimelineBlockDraft {
  return {
    clientId: partial.id,
    blockType: "custom",
    label: "Block",
    dayIndex: 0,
    startsAt: "2026-10-12T18:00",
    endsAt: "2026-10-12T19:00",
    notes: "",
    ...partial,
  };
}

function shift(partial: Partial<EventShiftDraft>): EventShiftDraft {
  return {
    role: "A1",
    personName: "",
    startsAt: "2026-10-12T18:00",
    endsAt: "2026-10-12T19:00",
    postedToExpense: false,
    notes: "",
    ...partial,
  };
}

const setup = block({ id: "setup", blockType: "setup", label: "Setup" });
const soundcheck = block({
  id: "sc",
  blockType: "soundcheck",
  label: "Headliner soundcheck",
  startsAt: "2026-10-12T17:00",
  endsAt: "2026-10-12T17:30",
  actOwned: true,
});

describe("rebaseActBlocks", () => {
  it("returns null when act blocks already match the server", () => {
    expect(rebaseActBlocks({ blocks: [setup, soundcheck], shifts: [] }, [soundcheck])).toBeNull();
  });

  it("adds a new act block without touching staff blocks", () => {
    const edited = { ...setup, label: "Load-in (edited)" };
    const next = rebaseActBlocks({ blocks: [edited], shifts: [] }, [soundcheck]);
    expect(next?.blocks.map((row) => row.label)).toEqual(["Headliner soundcheck", "Load-in (edited)"]);
  });

  it("moves crew with a moved act block unless their times are custom", () => {
    const moved = { ...soundcheck, startsAt: "2026-10-12T16:30", endsAt: "2026-10-12T17:00" };
    const following = shift({
      scheduleBlockId: "sc" as Id<"eventScheduleBlocks">,
      startsAt: soundcheck.startsAt,
      endsAt: soundcheck.endsAt,
    });
    const custom = shift({
      scheduleBlockId: "sc" as Id<"eventScheduleBlocks">,
      startsAt: "2026-10-12T17:10",
      endsAt: "2026-10-12T17:30",
      timesOverridden: true,
    });
    const next = rebaseActBlocks({ blocks: [soundcheck], shifts: [following, custom] }, [moved]);
    expect(next?.shifts[0]).toMatchObject({ startsAt: "2026-10-12T16:30", endsAt: "2026-10-12T17:00" });
    expect(next?.shifts[1]).toBe(custom);
  });

  it("unlinks crew from an act block the server removed", () => {
    const onBlock = shift({ scheduleBlockId: "sc" as Id<"eventScheduleBlocks">, scheduleBlockRef: "sc" });
    const next = rebaseActBlocks({ blocks: [setup, soundcheck], shifts: [onBlock] }, []);
    expect(next?.blocks).toEqual([setup]);
    expect(next?.shifts[0]).toMatchObject({ scheduleBlockId: undefined, scheduleBlockRef: undefined });
  });
});

describe("keepActBlocks", () => {
  it("keeps act blocks when Quick Add replaces staff blocks", () => {
    const quickAdd = [block({ id: "new-show", blockType: "show", label: "Show" })];
    expect(keepActBlocks([setup, soundcheck], quickAdd).map((row) => row.id)).toEqual(["sc", "new-show"]);
  });
});

describe("reconcileShiftsForReplacedBlocks", () => {
  it("keeps crew on an act block that survives Quick Add", () => {
    const quickAdd = keepActBlocks([setup, soundcheck], [block({ id: "new-setup", blockType: "setup" })]);
    const onSoundcheck = shift({ scheduleBlockId: "sc" as Id<"eventScheduleBlocks">, scheduleBlockRef: "sc" });
    const onSetup = shift({ scheduleBlockId: "setup" as Id<"eventScheduleBlocks">, scheduleBlockRef: "setup" });
    const [first, second] = reconcileShiftsForReplacedBlocks([setup, soundcheck], quickAdd, [
      onSoundcheck,
      onSetup,
    ]);
    expect(first).toMatchObject({ scheduleBlockId: "sc", scheduleBlockRef: "sc" });
    expect(second).toMatchObject({ scheduleBlockRef: "new-setup" });
  });
});
