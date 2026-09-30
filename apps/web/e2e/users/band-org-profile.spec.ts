import { test, expect } from "@playwright/test";
import { e2eEnv } from "../helpers/env";
import { pollConvex } from "../helpers/convex";

const updatedName = `E2E Updated Band ${Date.now()}`;

test.describe("band organization profile (admin birdseye)", () => {
  test.setTimeout(120_000);

  test("admin edits a band display name and the change persists", async ({ page }) => {
    const originalName = e2eEnv.bandOrgName;

    await page.goto("/dashboard/users/organizations");
    await expect(page.getByTestId("organizations-summary")).toBeVisible({ timeout: 30_000 });

    const bandRow = page
      .locator("li[data-testid^='org-row-']")
      .filter({ has: page.getByText(originalName, { exact: true }) })
      .first();
    await expect(bandRow).toBeVisible({ timeout: 15_000 });
    await bandRow.getByRole("button").first().click();

    const sheet = page.getByTestId("organization-sheet");
    await expect(sheet).toBeVisible({ timeout: 20_000 });
    const displayNameInput = sheet.getByLabel("Display name");
    const saveButton = sheet.getByRole("button", { name: "Save changes", exact: true });

    await displayNameInput.fill(updatedName);
    await expect(saveButton).toBeEnabled({ timeout: 10_000 });
    await saveButton.click();
    // Save is enabled only while the form is dirty, so disabled means it landed.
    await expect(saveButton).toBeDisabled({ timeout: 20_000 });

    const updated = await pollConvex<{ displayName: string | null }>(
      "e2eHelpers:getBandOrganizationProfileByDisplayName",
      { displayName: updatedName },
      (state) => state?.displayName === updatedName,
    );
    expect(updated.displayName).toBe(updatedName);

    // The panel is keyed on the org, so it stays open across the rename.
    await displayNameInput.fill(originalName);
    await expect(saveButton).toBeEnabled({ timeout: 10_000 });
    await saveButton.click();
    await expect(saveButton).toBeDisabled({ timeout: 20_000 });
  });
});
