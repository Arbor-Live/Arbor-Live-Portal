import { test, expect } from "@playwright/test";
import { e2eEnv } from "../helpers/env";
import { pollConvex, runConvex } from "../helpers/convex";

/**
 * Invoice managers roster (`/dashboard/financial-hub/managers`).
 *
 * The roster lists every user with their editable Title / Phone profile fields —
 * the fields that show up on quotes and client communications. Editing a row
 * calls `users.updateUserAdmin`, which writes `userAdminProfiles`.
 *
 * The spec edits the shared admin account's own row and restores it to empty
 * (its seeded default) in `afterAll` — a failed run must not leave a fixture
 * title on the account every other worktree signs in as.
 */
test.describe("invoice managers roster", () => {
  const stamp = Date.now();
  const fixtureTitle = `E2E Manager ${stamp}`;
  const fixturePhone = "6505550101";

  test.afterAll(() => {
    runConvex("e2eHelpers:setUserAdminProfileFields", {
      email: e2eEnv.adminEmail,
      title: "",
      phone: "",
    });
  });

  test("admin edits title and phone on the roster and they persist", async ({ page }) => {
    await page.goto("/dashboard/financial-hub/managers");
    await expect(page.getByText("Invoice managers").first()).toBeVisible({ timeout: 25_000 });

    // Find the admin's row by its meta email — the roster lists every user, and
    // the email is the one field that cannot collide with a display name.
    const row = page
      .locator("div.rounded-md.border.p-3")
      .filter({ has: page.getByText(e2eEnv.adminEmail) })
      .first();
    await expect(row).toBeVisible({ timeout: 25_000 });
    await expect(row).toContainText("Active");

    await row.getByPlaceholder("Title").fill(fixtureTitle);
    await row.getByPlaceholder("Phone").fill(fixturePhone);
    await expect(row.getByRole("button", { name: "Save" })).toBeVisible({ timeout: 15_000 });
    await row.getByRole("button", { name: "Save" }).click();

    const saved = await pollConvex<{ title: string; phone: string }>(
      "e2eHelpers:getUserAdminStateByEmail",
      { email: e2eEnv.adminEmail },
      (state) => state?.title === fixtureTitle && state?.phone === fixturePhone,
    );
    expect(saved.title).toBe(fixtureTitle);
    expect(saved.phone).toBe(fixturePhone);
  });
});
