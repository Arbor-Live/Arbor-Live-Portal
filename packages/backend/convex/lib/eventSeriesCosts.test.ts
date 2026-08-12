import { describe, expect, it } from "vitest";
import {
  effectiveBandsUsd,
  effectiveCrewUsd,
  effectiveExternalRentalsUsd,
  effectiveOtherUsd,
  computeSeriesCostSummary,
} from "./eventSeriesCosts";
import type { Doc } from "../_generated/dataModel";

function series(partial: Partial<Doc<"eventSeries">> = {}): Doc<"eventSeries"> {
  return {
    _id: "ks123" as Doc<"eventSeries">["_id"],
    _creationTime: 0,
    title: "Series",
    status: "active",
    timezone: "America/Los_Angeles",
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as Doc<"eventSeries">;
}

function event(partial: Partial<Doc<"events">> = {}): Doc<"events"> {
  return {
    _id: "ke123" as Doc<"events">["_id"],
    _creationTime: 0,
    title: "Show",
    status: "ready",
    startAt: 0,
    endAt: 0,
    timezone: "America/Los_Angeles",
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as Doc<"events">;
}

describe("series projected costs", () => {
  it("falls back to template bands/external/other when occurrence costs are unset", () => {
    const s = series({
      occurrenceBudgetCrewCostUsd: 100,
      occurrenceBandsCostUsd: 400,
      occurrenceExternalRentalsCostUsd: 50,
      occurrenceOtherCostUsd: 25,
      seriesBandsCostUsd: 10,
    });
    const occurrences = [event({ crewCostUsd: 0, bandsCostUsd: 0 })];
    const summary = computeSeriesCostSummary(s, occurrences);

    expect(effectiveCrewUsd(occurrences[0]!, s)).toBe(100);
    expect(effectiveBandsUsd(occurrences[0]!, s)).toBe(400);
    expect(effectiveExternalRentalsUsd(occurrences[0]!, s)).toBe(50);
    expect(effectiveOtherUsd(occurrences[0]!, s)).toBe(25);
    expect(summary.projectedGrandTotalUsd).toBe(100 + 400 + 50 + 25 + 10);
  });

  it("prefers recorded occurrence band cost over template", () => {
    const s = series({ occurrenceBandsCostUsd: 400 });
    const occurrences = [event({ bandsCostUsd: 250, crewCostUsd: 80 })];
    const summary = computeSeriesCostSummary(s, occurrences);
    expect(summary.projectedGrandTotalUsd).toBe(80 + 250);
  });
});
