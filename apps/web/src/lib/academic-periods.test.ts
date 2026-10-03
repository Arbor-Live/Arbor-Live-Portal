import { describe, expect, it } from "vitest";
import { pacificDateKey } from "@/lib/format";
import { nextQuarterPeriod, quarterWeek, recentQuarters } from "./academic-periods";

describe("recentQuarters", () => {
  it("lists working quarters that have started, newest first, skipping summer", () => {
    // Noon, Oct 2 2026 in Los Angeles: early Autumn 2026.
    const quarters = recentQuarters(Date.UTC(2026, 9, 2, 19), 4);
    expect(quarters.map((quarter) => quarter.label)).toEqual([
      "Autumn 2026",
      "Spring 2026",
      "Winter 2026",
      "Autumn 2025",
    ]);
    expect(pacificDateKey(quarters[0]!.startMs)).toBe("2026-09-22");
    expect(pacificDateKey(quarters[0]!.endMs)).toBe("2027-01-03");
  });

  it("in summer, starts from the spring quarter before it", () => {
    const quarters = recentQuarters(Date.UTC(2026, 6, 15, 19), 1);
    expect(quarters[0]!.label).toBe("Spring 2026");
  });
});

describe("periods", () => {
  it("next quarter skips summer", () => {
    expect(nextQuarterPeriod("2026-10-02")?.label).toBe("Winter 2027");
    expect(nextQuarterPeriod("2026-05-01")?.label).toBe("Autumn 2026");
  });
});

describe("quarterWeek", () => {
  it("numbers Autumn 2026 Wk 1–10 around Thanksgiving, then Finals and winter break", () => {
    expect(quarterWeek("2026-09-22")?.label).toBe("Wk 1"); // first day of classes (Tue)
    expect(quarterWeek("2026-09-21")?.label).toBe("Wk 1"); // its Monday
    expect(quarterWeek("2026-11-18")?.label).toBe("Wk 9");
    expect(quarterWeek("2026-11-25")?.label).toBe("Thanksgiving");
    expect(quarterWeek("2026-12-02")?.label).toBe("Wk 10");
    expect(quarterWeek("2026-12-09")?.label).toBe("Finals");
    expect(quarterWeek("2026-12-20")?.label).toBe("Winter break");
  });

  it("keeps spring Wk 10 when finals start on its Friday", () => {
    expect(quarterWeek("2027-06-01")?.label).toBe("Wk 10");
    expect(quarterWeek("2027-06-08")?.label).toBe("Finals");
  });

  it("winter runs ten weeks", () => {
    expect(quarterWeek("2027-01-04")?.label).toBe("Wk 1");
    expect(quarterWeek("2027-03-10")?.label).toBe("Wk 10");
    expect(quarterWeek("2027-03-16")?.label).toBe("Finals");
    expect(quarterWeek("2027-03-23")?.label).toBe("Spring break");
  });
});
