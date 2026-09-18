import { describe, expect, it } from "vitest";
import { weekLabelFor } from "./newsletterWeek";

describe("weekLabelFor", () => {
  it("labels a 7-day window with both endpoint dates", () => {
    // 2025-05-05T12:00:00Z is 5am Pacific on May 5.
    const label = weekLabelFor(Date.UTC(2025, 4, 5, 12, 0, 0));
    expect(label).toBe("May 5 – May 12");
  });

  it("keeps the start date in Pacific time near midnight UTC", () => {
    // 2025-05-06T03:00:00Z is still May 5, 8pm Pacific.
    const label = weekLabelFor(Date.UTC(2025, 4, 6, 3, 0, 0));
    expect(label.startsWith("May 5")).toBe(true);
  });

  it("crosses month boundaries without dropping the year context", () => {
    const label = weekLabelFor(Date.UTC(2025, 4, 28, 19, 0, 0));
    expect(label).toBe("May 28 – Jun 4");
  });
});
