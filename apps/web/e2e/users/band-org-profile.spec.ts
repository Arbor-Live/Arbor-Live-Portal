import { test, expect } from "@playwright/test";
import { e2eEnv } from "../helpers/env";
import { pollConvex } from "../helpers/convex";

const updatedName = `E2E Updated Band ${Date.now()}`;

test.describe("band organization profile (admin birdseye)", () => {
  test.setTimeout(120_000);

  test("admin edits a band display name and the change persists", async ({ page }) => {
    const originalName = e2eEnv.bandOrgName;

    await page.goto("/dashboard/users/organizations");
    await expect(page.getByText("Band Organizations")).toBeVisible({
      timeout: 30_000,
    });

    const bandRow = page
      .locator("tr")
      .filter({ has: page.locator("p").filter({ hasText: originalName }) })
      .first();
    await expect(bandRow).toBeVisible({ timeout: 15_000 });

    const displayNameInput = bandRow.locator("td").nth(1).locator("input");
    await displayNameInput.fill(updatedName);

    const saveButton = bandRow.getByRole("button", { name: "Save", exact: true });
    await expect(saveButton).toBeVisible({ timeout: 10_000 });
    await saveButton.click();
    await expect(saveButton).not.toBeVisible({ timeout: 20_000 });

    const updated = await pollConvex<{ displayName: string | null }>(
      "e2eHelpers:getBandOrganizationProfileByDisplayName",
      { displayName: updatedName },
      (state) => state?.displayName === updatedName,
    );
    expect(updated.displayName).toBe(updatedName);

    await displayNameInput.fill(originalName);
    await expect(saveButton).toBeVisible({ timeout: 10_000 });
    await saveButton.click();
    await expect(saveButton).not.toBeVisible({ timeout: 20_000 });
  });
});
