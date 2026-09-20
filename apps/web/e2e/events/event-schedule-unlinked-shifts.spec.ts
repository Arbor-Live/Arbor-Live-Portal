import { test, expect } from "@playwright/test";
import { acceptAppDialog } from "../helpers/auth";
import { runConvex } from "../helpers/convex";

test.describe("schedule unlinked shifts", () => {
  test("orphaned shifts with deleted blocks are visible and deletable", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedCrewedEventWithSchedule", {
      title: `E2E Orphan ${Date.now()}`,
    }) as { eventId: string; schedulePath: string };

    // Leaves the event with open shifts but zero schedule blocks — the state
    // that made shifts count as "open in editor" yet render nowhere.
    const orphaned = runConvex("e2eHelpers:seedOrphanedOpenShifts", {
      eventId: seeded.eventId,
    }) as { shiftCount: number; deletedBlockCount: number };
    expect(orphaned.shiftCount).toBeGreaterThan(0);

    await page.goto(seeded.schedulePath);
    await expect(page.getByText("Schedule", { exact: true }).first()).toBeVisible({
      timeout: 45_000,
    });

    await expect(page.getByText(/open in editor/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/not linked to a schedule block/i).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Delete Unassigned Shifts" }).click();
    await acceptAppDialog(page);

    await expect(page.getByText(/not linked to a schedule block/i)).toHaveCount(0, {
      timeout: 30_000,
    });

    const state = runConvex("e2eHelpers:getEventCrewAssignmentState", {
      eventId: seeded.eventId,
    }) as { shiftCount: number };
    expect(state.shiftCount).toBe(0);
  });
});
