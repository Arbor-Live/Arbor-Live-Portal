import { describe, expect, it } from "vitest";
import {
  isEventInNewsletterWindow,
  newsletterWindowEnd,
  weekLabelFor,
} from "./newsletterWeek";

describe("weekLabelFor", () => {
  it("labels the inclusive last day of a 7-day window", () => {
    // 2025-05-05T12:00:00Z is 5am Pacific on May 5. Seven days covers
    // May 5–11 inclusive, so the label must not read May 12.
    const label = weekLabelFor(Date.UTC(2025, 4, 5, 12, 0, 0));
    expect(label).toBe("May 5 – May 11");
  });

  it("keeps the start date in Pacific time near midnight UTC", () => {
    // 2025-05-06T03:00:00Z is still May 5, 8pm Pacific.
    const label = weekLabelFor(Date.UTC(2025, 4, 6, 3, 0, 0));
    expect(label.startsWith("May 5")).toBe(true);
  });

  it("crosses month boundaries without dropping the year context", () => {
    const label = weekLabelFor(Date.UTC(2025, 4, 28, 19, 0, 0));
    expect(label).toBe("May 28 – Jun 3");
  });
});

describe("newsletter window boundary", () => {
  const now = Date.UTC(2025, 4, 5, 12, 0, 0); // Mon May 5, 5am Pacific

  it("excludes an event on the following Monday, which belongs to next week", () => {
    // Exactly 7 days out: the same wall-clock Monday next week.
    expect(isEventInNewsletterWindow(newsletterWindowEnd(now), now)).toBe(false);
  });

  it("includes an event one millisecond before the boundary", () => {
    expect(isEventInNewsletterWindow(newsletterWindowEnd(now) - 1, now)).toBe(true);
  });

  it("includes the last day of the window and the current instant", () => {
    const lastDay = now + 6 * 24 * 60 * 60 * 1000;
    expect(isEventInNewsletterWindow(lastDay, now)).toBe(true);
    expect(isEventInNewsletterWindow(now, now)).toBe(true);
  });

  it("excludes events that already started", () => {
    expect(isEventInNewsletterWindow(now - 1, now)).toBe(false);
  });
});
