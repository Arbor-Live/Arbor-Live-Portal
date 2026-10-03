import { test, expect } from "@playwright/test";

/**
 * Home and My post-event work on the shared page patterns (#413).
 */
test.describe("admin Home", () => {
  test("one Customize control and one upcoming-events list", async ({ page }) => {
    await page.goto("/dashboard");
    const home = page.getByTestId("adminHome-dashboard");
    await expect(home).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Home", level: 1 })).toBeVisible();

    // "Widgets" and "Customize" were merged; crewing attention folded into
    // Upcoming events as flags.
    await expect(home.getByRole("button", { name: "Widgets" })).toHaveCount(0);
    await expect(page.getByText("Crewing attention")).toHaveCount(0);
    await expect(page.getByTestId("home-upcoming-events")).toBeVisible({ timeout: 30_000 });

    await home.getByRole("button", { name: "Customize" }).click();
    const customize = page.getByTestId("dashboard-customize");
    await expect(customize).toBeVisible();
    await expect(customize.getByRole("switch", { name: "Show Upcoming events" })).toBeVisible();
    await home.getByRole("button", { name: "Done" }).click();
    await expect(customize).toHaveCount(0);
  });
});

test.describe("my post-event work", () => {
  test("uses the page header and an empty state or a summary", async ({ page }) => {
    await page.goto("/dashboard/events/post-event");
    const root = page.getByTestId("post-event-work-page");
    await expect(root).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "My post-event work", level: 1 })).toBeVisible();
    await expect(
      root.getByText("Nothing waiting on you.").or(page.getByTestId("post-event-work-summary")),
    ).toBeVisible({ timeout: 30_000 });
  });
});
