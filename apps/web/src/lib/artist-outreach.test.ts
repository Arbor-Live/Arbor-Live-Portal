import { describe, expect, it } from "vitest";
import {
  countOutreach,
  daysAgo,
  isStale,
  outreachStage,
  outreachSummary,
} from "./artist-outreach";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 4, 20);

describe("outreachSummary", () => {
  it("says nobody was asked", () => {
    expect(outreachSummary(countOutreach([]))).toBe("Nobody asked yet");
  });

  it("counts every answer, waiting last", () => {
    const counts = countOutreach([
      { status: "available" },
      { status: "unavailable" },
      { status: "unavailable" },
      { status: "asked" },
    ]);
    expect(outreachSummary(counts)).toBe("Asked 4 · 1 available · 2 can't · 1 waiting");
  });
});

describe("outreachStage", () => {
  it("prefers an available act, then pending replies", () => {
    expect(outreachStage(countOutreach([]))).toBe("none");
    expect(outreachStage(countOutreach([{ status: "asked" }, { status: "available" }]))).toBe("available");
    expect(outreachStage(countOutreach([{ status: "asked" }, { status: "unavailable" }]))).toBe("waiting");
    expect(outreachStage(countOutreach([{ status: "unavailable" }]))).toBe("declined");
  });
});

describe("daysAgo and isStale", () => {
  it("reads in days", () => {
    expect(daysAgo("Asked", NOW - 2 * 60 * 60 * 1000, NOW)).toBe("Asked today");
    expect(daysAgo("Replied", NOW - DAY, NOW)).toBe("Replied yesterday");
    expect(daysAgo("Asked", NOW - 5 * DAY, NOW)).toBe("Asked 5 days ago");
  });

  it("flags only unanswered asks past three days", () => {
    expect(isStale({ status: "asked", askedAt: NOW - 2 * DAY }, NOW)).toBe(false);
    expect(isStale({ status: "asked", askedAt: NOW - 3 * DAY }, NOW)).toBe(true);
    expect(isStale({ status: "unavailable", askedAt: NOW - 9 * DAY }, NOW)).toBe(false);
  });
});
