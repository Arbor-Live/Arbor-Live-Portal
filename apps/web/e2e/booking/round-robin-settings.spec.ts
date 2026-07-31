import { test, expect } from "@playwright/test";
import { e2eEnv } from "../helpers/env";
import { pollConvex, runConvex } from "../helpers/convex";
import { pickSearchableOption } from "../helpers/select";

/**
 * Round-robin assignee settings (`/dashboard/events/requests/settings`).
 *
 * This writes the shared `default` `bookingRequestSettings` row, so the spec
 * restores it to empty (its seeded default) in `afterEach` — a failed run
 * cannot leave a fixture user in the rotation, and a real user's rotation is
 * never clobbered because the e2e helper force-resets the row directly.
 */
test.describe("booking request round-robin settings", () => {
  test.afterEach(() => {
    // Always restore the empty default, even when the test failed midway — a
    // broken run must not leave a fixture user in the shared rotation.
    runConvex("e2eHelpers:setBookingRequestRotationState", { roundRobinUserIds: [] });
  });

  test("adding and removing a rotation member persists", async ({ page }) => {
    const { userId: adminUserId } = runConvex("e2eHelpers:getUserIdByEmail", {
      email: e2eEnv.adminEmail,
    }) as { userId: string | null };
    expect(adminUserId).toBeTruthy();

    await page.goto("/dashboard/events/requests/settings");
    await expect(page.getByText("No one in the rotation yet.")).toBeVisible({ timeout: 25_000 });

    // Add the admin to the rotation.
    await pickSearchableOption(
      page,
      page.getByTestId("searchable-select-trigger"),
      e2eEnv.adminName,
      e2eEnv.adminName,
    );
    await expect(page.getByRole("button", { name: "Add" })).toBeEnabled();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove" })).toBeVisible();
    await page.getByRole("button", { name: "Save rotation" }).click();

    const saved = await pollConvex<{ roundRobinUserIds: string[] }>(
      "e2eHelpers:getBookingRequestSettingsState",
      {},
      (row) =>
        row?.roundRobinUserIds.length === 1 && row.roundRobinUserIds[0] === adminUserId,
    );
    expect(saved.roundRobinUserIds).toEqual([adminUserId]);

    // Remove it again and save — back to the empty default.
    await page.getByRole("button", { name: "Remove", exact: true }).click();
    await expect(page.getByText("No one in the rotation yet.")).toBeVisible();
    await page.getByRole("button", { name: "Save rotation" }).click();

    await pollConvex<{ roundRobinUserIds: string[] }>(
      "e2eHelpers:getBookingRequestSettingsState",
      {},
      (row) => row?.roundRobinUserIds.length === 0,
    );
  });
});
