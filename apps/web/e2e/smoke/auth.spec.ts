import { test, expect } from "@playwright/test";

test.describe("auth smoke", () => {
  test("admin storageState reaches the dashboard", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("navigation").or(page.locator("[data-sidebar]")).first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test("sidebar Support links to the Arbor email and has no Feedback item", async ({ page }) => {
    await page.goto("/dashboard");
    const sidebar = page.locator('[data-slot="sidebar"]').first();
    await expect(sidebar).toBeVisible({ timeout: 20_000 });

    const support = sidebar.getByRole("link", { name: "Support" });
    await expect(support).toHaveAttribute("href", "mailto:arborlive@stanford.edu");
    await expect(sidebar.getByText("Feedback", { exact: true })).toHaveCount(0);
  });
});
