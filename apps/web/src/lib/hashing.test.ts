import { describe, expect, it } from "vitest";
import { pacificDateAndTimeToMs } from "@/lib/format";
import { attendanceConfirmText, hashDayLabel, hashSlotLabel, hashStartTime, hashTimeRange, offWeekLabel } from "./hashing";
import { activeHashingTab, hashingTabPath } from "./hashing-tabs";

const at = (time: string) => pacificDateAndTimeToMs("2026-11-17", time)!;

describe("attendanceConfirmText", () => {
  it("says what each side of a correction gets", () => {
    expect(attendanceConfirmText({ added: ["Ben"], removed: ["Ana", "Theo"] })).toBe(
      "Ben will get credit and pay. Ana, Theo will lose this shift and its pay, and need a hash again.",
    );
    expect(attendanceConfirmText({ added: ["Ben"], removed: [] })).toBe("Ben will get credit and pay.");
  });
});

describe("hashing labels", () => {
  it("names a day from its key", () => {
    expect(hashDayLabel("2026-11-17")).toBe("Tue, Nov 17");
  });
  it("keeps time ranges short", () => {
    expect(hashTimeRange(at("16:00"), at("17:00"))).toBe("4–5pm");
    expect(hashTimeRange(at("16:30"), at("17:30"))).toBe("4:30–5:30pm");
    expect(hashTimeRange(at("11:00"), at("12:30"))).toBe("11am–12:30pm");
  });
  it("gives the slot as a sentence", () => {
    expect(hashSlotLabel({ weekday: 2, startTime: "16:00", durationMinutes: 60 })).toBe("Tuesdays, 4–5pm");
    expect(hashSlotLabel({ weekday: 5, startTime: "09:30", durationMinutes: 150 })).toBe("Fridays, 9:30am–12pm");
  });
  it("reads a time back for an input", () => {
    expect(hashStartTime(at("16:05"))).toBe("16:05");
  });
  it("names off weeks", () => {
    expect(offWeekLabel("2026-11-24")).toBe("Thanksgiving");
    expect(offWeekLabel("2026-11-17")).toBeNull();
  });
});

describe("hashing tabs", () => {
  it("maps paths both ways", () => {
    expect(hashingTabPath("mine")).toBe("/dashboard/events/hashing");
    expect(hashingTabPath("setup")).toBe("/dashboard/events/hashing/setup");
    expect(activeHashingTab("/dashboard/events/hashing/history")).toBe("history");
    expect(activeHashingTab("/dashboard/events/hashing")).toBe("mine");
  });
});
