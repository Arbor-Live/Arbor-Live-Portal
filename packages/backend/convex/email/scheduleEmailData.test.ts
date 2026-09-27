import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { userCoversEntireSchedule } from "./scheduleEmailData";

const id = (value: string) => value as Id<"eventScheduleBlocks">;

describe("userCoversEntireSchedule", () => {
  const blocks = [
    { _id: id("setup"), blockType: "setup" as const },
    { _id: id("show"), blockType: "show" as const },
    { _id: id("doors"), blockType: "doors" as const },
    { _id: id("set"), blockType: "set" as const },
  ];

  it("counts sections only, so shifts on every section cover the event", () => {
    expect(
      userCoversEntireSchedule([{ scheduleBlockId: id("setup") }, { scheduleBlockId: id("show") }], blocks),
    ).toBe(true);
  });

  it("is false when a section has no shift", () => {
    expect(userCoversEntireSchedule([{ scheduleBlockId: id("show") }], blocks)).toBe(false);
  });

  it("is false when the run of show has no sections", () => {
    expect(userCoversEntireSchedule([], [{ _id: id("doors"), blockType: "doors" as const }])).toBe(false);
  });
});
