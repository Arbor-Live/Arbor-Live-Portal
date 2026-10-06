import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { isTraineeDecisionNeeded, loadTrainingEndsAt } from "./crewTraineeTraining";

type Shift = { eventId: string; endsAt: number; userId?: string; crewApplicationId?: string };

function fakeCtx(shifts: Shift[], eventStatusById: Record<string, string>): QueryCtx {
  return {
    db: {
      query() {
        return {
          withIndex() {
            return {
              async take(limit: number) {
                return shifts.slice(0, limit);
              },
            };
          },
        };
      },
      async get(id: string) {
        const status = eventStatusById[id];
        return status ? { _id: id, status } : null;
      },
    },
  } as unknown as QueryCtx;
}

const applicationId = "app" as Id<"crewApplications">;

describe("loadTrainingEndsAt", () => {
  it("is the end of the last trainee shift", async () => {
    const ctx = fakeCtx(
      [
        { eventId: "a", endsAt: 100, crewApplicationId: applicationId },
        { eventId: "b", endsAt: 300, crewApplicationId: applicationId },
      ],
      { a: "confirmed", b: "confirmed" },
    );
    expect(await loadTrainingEndsAt(ctx, applicationId)).toBe(300);
  });

  it("ignores cancelled or deleted events and filled shifts", async () => {
    const ctx = fakeCtx(
      [
        { eventId: "a", endsAt: 100, crewApplicationId: applicationId },
        { eventId: "cancelled", endsAt: 500, crewApplicationId: applicationId },
        { eventId: "gone", endsAt: 600, crewApplicationId: applicationId },
        { eventId: "a", endsAt: 700, crewApplicationId: applicationId, userId: "member" },
      ],
      { a: "confirmed", cancelled: "cancelled" },
    );
    expect(await loadTrainingEndsAt(ctx, applicationId)).toBe(100);
  });

  it("is undefined with no training shift", async () => {
    expect(await loadTrainingEndsAt(fakeCtx([], {}), applicationId)).toBeUndefined();
  });
});

describe("isTraineeDecisionNeeded", () => {
  it("flags a trainee once training has ended", () => {
    expect(isTraineeDecisionNeeded({ status: "trainee" }, 100, 100)).toBe(true);
    expect(isTraineeDecisionNeeded({ status: "trainee" }, 200, 100)).toBe(false);
    expect(isTraineeDecisionNeeded({ status: "trainee" }, undefined, 100)).toBe(false);
    expect(isTraineeDecisionNeeded({ status: "converted" }, 50, 100)).toBe(false);
  });
});
