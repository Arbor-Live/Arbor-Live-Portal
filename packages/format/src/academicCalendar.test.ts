import { describe, expect, it } from "vitest";
import {
  STANFORD_ACADEMIC_YEARS,
  STANFORD_QUARTERS,
  academicCalendarSkipFilter,
  academicDayNote,
  arborClosureForDate,
  arborClosuresInRange,
  computeOccurrenceSlots,
  pacificDateAndTimeToMs,
  pacificDateKey,
  stanfordAcademicYearForDate,
  stanfordCurrentOrNextQuarter,
  stanfordNoClassDay,
  stanfordQuarterForDate,
} from "./index";

describe("Stanford academic calendar", () => {
  it("covers 2023-24 through 2033-34 with four quarters each", () => {
    expect(STANFORD_ACADEMIC_YEARS.map((year) => year.id)).toEqual([
      "2023-24", "2024-25", "2025-26", "2026-27", "2027-28", "2028-29",
      "2029-30", "2030-31", "2031-32", "2032-33", "2033-34",
    ]);
    expect(STANFORD_QUARTERS).toHaveLength(44);
  });

  it("starts every non-Tuesday quarter on a Monday", () => {
    for (const quarter of STANFORD_QUARTERS) {
      const weekday = new Date(`${quarter.startDate}T12:00:00Z`).getUTCDay();
      if (quarter.id === "2023-24-autumn" || quarter.id === "2026-27-autumn") {
        expect(weekday).toBe(2);
      } else {
        expect(weekday, quarter.id).toBe(1);
      }
    }
  });

  it("tiles quarters and years with no gaps", () => {
    for (let index = 1; index < STANFORD_QUARTERS.length; index += 1) {
      const previousEnd = new Date(`${STANFORD_QUARTERS[index - 1]!.reportingEndDate}T12:00:00Z`);
      const start = new Date(`${STANFORD_QUARTERS[index]!.startDate}T12:00:00Z`);
      expect(start.getTime() - previousEnd.getTime()).toBe(24 * 60 * 60 * 1000);
    }
    expect(stanfordAcademicYearForDate("2027-09-19")?.id).toBe("2026-27");
    expect(stanfordAcademicYearForDate("2027-09-20")?.id).toBe("2027-28");
  });

  it("matches the 2026-27 Registrar calendar", () => {
    expect(stanfordNoClassDay("2026-11-03")).toEqual({ kind: "holiday", label: "Democracy Day" });
    expect(stanfordNoClassDay("2026-11-25")?.label).toBe("Thanksgiving recess");
    expect(stanfordNoClassDay("2026-12-09")?.kind).toBe("finals");
    expect(stanfordNoClassDay("2026-12-25")?.label).toBe("Winter break");
    expect(stanfordNoClassDay("2027-01-18")?.label).toBe("Martin Luther King, Jr., Day");
    expect(stanfordNoClassDay("2027-02-15")?.label).toBe("Presidents' Day");
    expect(stanfordNoClassDay("2027-03-24")?.label).toBe("Spring break");
    expect(stanfordNoClassDay("2027-05-31")?.label).toBe("Memorial Day");
    expect(stanfordNoClassDay("2027-06-03")?.label).toBe("Day before finals");
    expect(stanfordNoClassDay("2027-07-05")?.label).toBe("Independence Day");
    expect(stanfordNoClassDay("2027-08-30")?.label).toBe("Summer break");
    // Ordinary class days.
    expect(stanfordNoClassDay("2026-10-07")).toBeNull();
    expect(stanfordNoClassDay("2027-04-14")).toBeNull();
  });

  it("returns null outside coverage", () => {
    expect(stanfordNoClassDay("2020-01-01")).toBeNull();
    expect(stanfordQuarterForDate("2040-01-01")).toBeNull();
  });

  it("finds the current or next quarter", () => {
    expect(stanfordCurrentOrNextQuarter("2026-10-02")?.label).toBe("Autumn 2026");
    // Winter break → the next quarter.
    expect(stanfordCurrentOrNextQuarter("2026-12-20")?.label).toBe("Winter 2027");
    // Reporting ranges give the break to the quarter before it.
    expect(stanfordQuarterForDate("2026-12-20")?.label).toBe("Autumn 2026");
  });
});

describe("Arbor closures", () => {
  it("closes for winter break, spring break, and all of summer — not Thanksgiving", () => {
    expect(arborClosureForDate("2026-12-25")?.label).toBe("Winter break");
    expect(arborClosureForDate("2027-03-24")?.label).toBe("Spring break");
    expect(arborClosureForDate("2027-06-10")?.label).toBe("Summer 2027");
    expect(arborClosureForDate("2027-07-15")?.label).toBe("Summer 2027");
    expect(arborClosureForDate("2027-09-19")?.label).toBe("Summer 2027");
    expect(arborClosureForDate("2027-09-20")).toBeNull();
    expect(arborClosureForDate("2026-11-25")).toBeNull();
    expect(arborClosureForDate("2027-06-09")).toBeNull();
  });

  it("prefers the closure over a Stanford reason", () => {
    expect(academicDayNote("2027-07-05")?.kind).toBe("closed");
    expect(academicDayNote("2026-11-25")?.kind).toBe("break");
  });

  it("lists closures overlapping a range", () => {
    expect(arborClosuresInRange("2026-12-01", "2027-01-10").map((c) => c.label)).toEqual([
      "Winter break",
    ]);
  });
});

describe("computeOccurrenceSlots", () => {
  const wednesdays = pacificDateAndTimeToMs("2026-10-07", "19:00")!;

  it("refuses a count it can't meet instead of creating fewer", () => {
    // Skipping every week leaves nothing; skipping all but one week a year
    // runs out of scan before 50 are found.
    expect(() =>
      computeOccurrenceSlots({
        anchorStartAt: wednesdays,
        intervalWeeks: 1,
        occurrenceCount: 50,
        skip: (startAt) => (startAt - wednesdays) % (52 * 7 * 24 * 60 * 60 * 1000) !== 0,
      }),
    ).toThrow(/Only \d+ of 50 occurrences fit/);
  });

  it("matches plain weekly generation without a skip filter", () => {
    const slots = computeOccurrenceSlots({ anchorStartAt: wednesdays, intervalWeeks: 1, occurrenceCount: 3 });
    expect(slots.map((slot) => slot.occurrenceIndex)).toEqual([0, 1, 2]);
    expect(slots.map((slot) => pacificDateKey(slot.startAt))).toEqual([
      "2026-10-07", "2026-10-14", "2026-10-21",
    ]);
  });

  it("skips Thanksgiving and finals, keeping week indexes", () => {
    const slots = computeOccurrenceSlots({
      anchorStartAt: wednesdays,
      intervalWeeks: 1,
      seriesEndAt: pacificDateAndTimeToMs("2026-12-31", "23:59")!,
      skip: academicCalendarSkipFilter("breaks_and_finals"),
    });
    const days = slots.map((slot) => pacificDateKey(slot.startAt));
    expect(days).not.toContain("2026-11-25");
    expect(days).not.toContain("2026-12-09");
    expect(days.at(-1)).toBe("2026-12-02");
    expect(slots.find((slot) => pacificDateKey(slot.startAt) === "2026-12-02")?.occurrenceIndex).toBe(8);
  });

  it("skips the summer closure", () => {
    const slots = computeOccurrenceSlots({
      anchorStartAt: pacificDateAndTimeToMs("2027-05-26", "19:00")!,
      intervalWeeks: 1,
      occurrenceCount: 4,
      skip: academicCalendarSkipFilter("breaks"),
    });
    // Jun 9 is finals (kept in "breaks" mode); summer is closed until autumn.
    expect(slots.map((slot) => pacificDateKey(slot.startAt))).toEqual([
      "2027-05-26", "2027-06-02", "2027-06-09", "2027-09-22",
    ]);
  });

  it("counts only kept occurrences", () => {
    const slots = computeOccurrenceSlots({
      anchorStartAt: pacificDateAndTimeToMs("2026-11-18", "19:00")!,
      intervalWeeks: 1,
      occurrenceCount: 3,
      skip: academicCalendarSkipFilter("breaks"),
    });
    expect(slots.map((slot) => pacificDateKey(slot.startAt))).toEqual([
      "2026-11-18", "2026-12-02", "2026-12-09",
    ]);
  });
});
