import { describe, expect, it } from "vitest";
import {
  freeWindowsAround,
  localDateTimeInputToMs,
  sectionAvailability,
  sectionsClearOfBusy,
} from "@/lib/crew-availability";

function ms(time: string) {
  return localDateTimeInputToMs(`2026-10-10T${time}`)!;
}

const setup = { _id: "setup", id: "setup", startsAt: ms("14:00"), endsAt: ms("17:00") };
const show = { _id: "show", id: "show", startsAt: ms("17:00"), endsAt: ms("22:00") };

describe("sectionAvailability", () => {
  it("reads yes, backup, no, and no answer", () => {
    expect(sectionAvailability({ responseStatus: "yes" }, show).level).toBe("available");
    expect(sectionAvailability({ responseStatus: "only_if_necessary" }, show).level).toBe("backup");
    expect(sectionAvailability({ responseStatus: "no" }, show).level).toBe("unavailable");
    expect(sectionAvailability(undefined, show).level).toBe("pending");
  });

  it("uses picked sections for partial answers", () => {
    const answer = {
      responseStatus: "partial" as const,
      partialWindows: [{ scheduleBlockId: "setup", startsAt: setup.startsAt, endsAt: setup.endsAt }],
    };
    expect(sectionAvailability(answer, setup).level).toBe("available");
    expect(sectionAvailability(answer, show).level).toBe("unavailable");
  });

  it("marks a picked section as part when a busy time cuts into it", () => {
    const answer = {
      responseStatus: "partial" as const,
      partialWindows: [{ scheduleBlockId: "show", startsAt: show.startsAt, endsAt: show.endsAt }],
      busyWindows: [{ startsAt: ms("19:00"), endsAt: ms("20:00"), notes: "class" }],
    };
    const result = sectionAvailability(answer, show);
    expect(result.level).toBe("part");
    expect(result.detail).toContain("class");
  });

  it("treats custom windows by overlap (older answers)", () => {
    const answer = {
      responseStatus: "partial" as const,
      partialWindows: [{ startsAt: ms("18:00"), endsAt: ms("23:00") }],
    };
    expect(sectionAvailability(answer, show).level).toBe("part");
    expect(sectionAvailability(answer, setup).level).toBe("unavailable");
  });
});

describe("busy helpers", () => {
  it("unchecks sections a busy time overlaps", () => {
    expect(sectionsClearOfBusy([setup, show], [{ startsAt: ms("18:00"), endsAt: ms("19:00") }])).toEqual([
      "setup",
    ]);
  });

  it("finds the free time around busy times", () => {
    const span = { startsAt: ms("14:00"), endsAt: ms("22:00") };
    expect(freeWindowsAround(span, [{ startsAt: ms("16:00"), endsAt: ms("18:00") }])).toEqual([
      { startsAt: ms("14:00"), endsAt: ms("16:00") },
      { startsAt: ms("18:00"), endsAt: ms("22:00") },
    ]);
  });
});
