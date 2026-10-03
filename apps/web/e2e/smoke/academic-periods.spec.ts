import { test, expect } from "@playwright/test";

/**
 * Stanford calendar periods outside Insights: quarter shortcuts on date
 * ranges, and quarter weeks on the events calendar and board.
 */
test.describe("Stanford calendar periods", () => {
  test("crew scheduling jumps to this quarter and keeps it in the URL", async ({ page }) => {
    await page.goto("/dashboard/events/crew-scheduling");
    await expect(page.getByText("Date range").first()).toBeVisible({ timeout: 30_000 });
    const thisQuarter = page.getByRole("radio", { name: "This quarter" });
    await expect(thisQuarter).toHaveAttribute("aria-checked", "false");
    await thisQuarter.click();
    await expect(thisQuarter).toHaveAttribute("aria-checked", "true");
    await page.waitForURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/, { timeout: 30_000 });

    // A reload keeps the quarter selected (the range is read back from the URL).
    await page.reload();
    await expect(page.getByRole("radio", { name: "This quarter" })).toHaveAttribute("aria-checked", "true", {
      timeout: 30_000,
    });
  });

  test("events board and calendar label weeks of the quarter", async ({ page }) => {
    await page.goto("/dashboard/events");
    await expect(page.getByTestId("board-week-label").first()).toContainText(
      /(Autumn|Winter|Spring|Summer) \d{4} · (Wk \d+|Finals|.*break|Thanksgiving)/,
      { timeout: 30_000 },
    );

    await page.getByRole("button", { name: "Calendar", exact: true }).click();
    await expect(page.getByTestId("calendar-quarter-week").first()).toHaveText(
      /^(Wk \d+|Finals|.*break|Thanksgiving)$/,
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "Month", exact: true }).click();
    await expect(page.getByTestId("calendar-quarter-week").first()).toBeVisible({ timeout: 30_000 });
  });
});
