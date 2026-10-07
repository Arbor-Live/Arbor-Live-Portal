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

  test("crew scheduling rejects an impossible or backwards range from the URL", async ({ page }) => {
    // A backwards range says so instead of erroring the board.
    await page.goto("/dashboard/events/crew-scheduling?from=2026-03-10&to=2026-03-01");
    await expect(page.getByText("Choose a valid start and end date.")).toBeVisible({ timeout: 30_000 });

    // A day that doesn't exist falls back to the default range.
    await page.goto("/dashboard/events/crew-scheduling?from=2026-02-30&to=2026-03-05");
    await expect(page.getByText("Date range").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("date-picker").first()).not.toHaveAttribute("data-value", "2026-02-30");
    await expect(page.getByText("Choose a valid start and end date.")).toHaveCount(0);
  });

  test("events board and calendar label weeks of the quarter", async ({ page }) => {
    await page.goto("/dashboard/events");
    await expect(page.getByTestId("board-week-label").first()).toContainText(
      /(Autumn|Winter|Spring|Summer) \d{4} · (Wk \d+|Finals|.*break|Thanksgiving)/,
      { timeout: 30_000 },
    );

    await page.getByRole("radio", { name: "Calendar", exact: true }).click();
    await expect(page.getByTestId("calendar-quarter-week").first()).toHaveText(
      /^(Wk \d+|Finals|.*break|Thanksgiving)$/,
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "Month", exact: true }).click();
    await expect(page.getByTestId("calendar-quarter-week").first()).toBeVisible({ timeout: 30_000 });
  });
});
