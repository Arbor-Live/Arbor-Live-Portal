import { describe, expect, it } from "vitest";
import { crewHoursWindows, formatHours } from "@/lib/crew-hours-windows";
import { pacificDateKey } from "@/lib/format";

describe("crewHoursWindows", () => {
  it("runs the week Monday through Sunday", () => {
    // Friday, Oct 9 2026.
    const { week } = crewHoursWindows("2026-10-09");
    expect(pacificDateKey(week.startMs)).toBe("2026-10-05");
    expect(pacificDateKey(week.endMs)).toBe("2026-10-11");
  });

  it("keeps Sunday in the week that started the Monday before", () => {
    const { week } = crewHoursWindows("2026-10-11");
    expect(pacificDateKey(week.startMs)).toBe("2026-10-05");
  });

  it("uses the Stanford quarter today falls in", () => {
    const { quarter } = crewHoursWindows("2026-10-09");
    expect(quarter?.label).toBe("Autumn 2026");
    expect(pacificDateKey(quarter!.startMs)).toBe("2026-09-22");
  });
});

describe("formatHours", () => {
  it("drops trailing zeros", () => {
    expect(formatHours(12)).toBe("12h");
    expect(formatHours(7.25)).toBe("7.3h");
  });
});
