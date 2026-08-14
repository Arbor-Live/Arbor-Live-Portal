import { describe, expect, it } from "vitest";
import {
  applyScheduleBlockEndChange,
  applyScheduleBlockStartChange,
  createScheduleBlockDraft,
  sortScheduleBlocksByTime,
} from "./event-schedule-blocks";

function block(partial: {
  label?: string;
  startsAt: string;
  endsAt: string;
  dayIndex?: number;
}) {
  return {
    blockType: "custom" as const,
    label: "Block",
    dayIndex: 0,
    notes: "",
    ...partial,
  };
}

describe("createScheduleBlockDraft", () => {
  it("uses the event Day 1 date and a 1-hour window", () => {
    const draft = createScheduleBlockDraft({ anchorStartsAt: "2026-10-15T19:00" });
    expect(draft).toMatchObject({
      dayIndex: 0,
      startsAt: "2026-10-15T19:00",
      endsAt: "2026-10-15T20:00",
    });
  });

  it("places a clicked time on the selected event day", () => {
    const draft = createScheduleBlockDraft({
      anchorStartsAt: "2026-10-15T19:00",
      dayIndex: 1,
      startMinutesInDay: 14 * 60,
    });
    expect(draft).toMatchObject({
      dayIndex: 1,
      startsAt: "2026-10-16T14:00",
      endsAt: "2026-10-16T15:00",
    });
  });

  it("keeps the clicked row even when the click is before the event start time", () => {
    const draft = createScheduleBlockDraft({
      anchorStartsAt: "2026-10-15T19:00",
      dayIndex: 0,
      startMinutesInDay: 10 * 60,
    });
    expect(draft).toMatchObject({
      dayIndex: 0,
      startsAt: "2026-10-15T10:00",
      endsAt: "2026-10-15T11:00",
    });
  });
});

describe("schedule block start/end coupling", () => {
  it("sets end to start + 1 hour when end is empty", () => {
    const next = applyScheduleBlockStartChange(
      block({ startsAt: "", endsAt: "" }),
      "2026-10-15T18:00",
    );
    expect(next.startsAt).toBe("2026-10-15T18:00");
    expect(next.endsAt).toBe("2026-10-15T19:00");
  });

  it("sets start to end - 1 hour when start is empty", () => {
    const next = applyScheduleBlockEndChange(
      block({ startsAt: "", endsAt: "" }),
      "2026-10-15T21:00",
    );
    expect(next.startsAt).toBe("2026-10-15T20:00");
    expect(next.endsAt).toBe("2026-10-15T21:00");
  });

  it("preserves a custom duration when start moves", () => {
    const next = applyScheduleBlockStartChange(
      block({ startsAt: "2026-10-15T18:00", endsAt: "2026-10-15T21:00" }),
      "2026-10-15T19:00",
    );
    expect(next.startsAt).toBe("2026-10-15T19:00");
    expect(next.endsAt).toBe("2026-10-15T22:00");
  });
});

describe("sortScheduleBlocksByTime", () => {
  it("orders by start time rather than insertion order", () => {
    const sorted = sortScheduleBlocksByTime([
      block({ label: "Late", startsAt: "2026-10-15T21:00", endsAt: "2026-10-15T22:00" }),
      block({ label: "Early", startsAt: "2026-10-15T10:00", endsAt: "2026-10-15T11:00" }),
    ]);
    expect(sorted.map((row) => row.label)).toEqual(["Early", "Late"]);
  });
});
