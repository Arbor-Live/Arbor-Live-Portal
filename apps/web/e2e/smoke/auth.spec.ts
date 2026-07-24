import { test, expect } from "@playwright/test";

test.describe("auth smoke", () => {
  test("admin storageState reaches the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("navigation").or(page.locator("[data-sidebar]")).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});
