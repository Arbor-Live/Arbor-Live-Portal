import { describe, expect, it } from "vitest";
import { pacificDateKey } from "@/lib/format";
import { recentQuarters } from "./insights-quarters";

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
