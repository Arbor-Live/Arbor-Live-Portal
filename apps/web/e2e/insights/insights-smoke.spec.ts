import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";

test.describe("insights dashboard", () => {
  test("admin can open Insights and switch Finances / Demand / Events / Crew / Ops tabs", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.goto("/dashboard/financial-hub/insights");
    const insights = page.getByTestId("insights-page");
    await expect(insights).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Insights", level: 1 })).toBeVisible();
    const tabs = page.getByRole("navigation", { name: "Insights sections" });

    // Default Finances tab
    await expect(page.getByTestId("insights-finances-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Recognized revenue").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("insights-stat-net-profit")).toBeVisible();
    await expect(page.getByText("Margin by event type").first()).toBeVisible();
    await expect(page.getByText("Receivables aging").first()).toBeVisible();

    // Booked ahead links straight to the Events tab.
    const bookedAhead = page.getByTestId("insights-stat-booked-ahead");
    await expect(bookedAhead).toBeVisible();
    await bookedAhead.getByRole("link", { name: "Upcoming events" }).click();
    await page.waitForURL(/\/insights\/events/, { timeout: 30_000 });
    await expect(page.getByTestId("insights-events-panel")).toBeVisible({ timeout: 30_000 });
    await expect(tabs.getByRole("link", { name: "Events" })).toHaveAttribute("aria-current", "page");

    // The date range lives in the URL and carries across tabs.
    await page.getByTestId("insights-range").getByRole("radio", { name: "90 days" }).click();
    await page.waitForURL(/range=90d/, { timeout: 30_000 });

    await tabs.getByRole("link", { name: "Demand" }).click();
    await page.waitForURL(/\/insights\/demand\?range=90d/, { timeout: 30_000 });
    await expect(page.getByTestId("insights-demand-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Booking funnel").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("insights-stat-lead-time")).toBeVisible();
    await expect(page.getByText("Conversion by category").first()).toBeVisible();
    await expect(page.getByText("Decline reasons").first()).toBeVisible();
    await expect(page.getByText("Quote engagement").first()).toBeVisible();

    await tabs.getByRole("link", { name: "Events" }).click();
    await page.waitForURL(/\/insights\/events\?range=90d/, { timeout: 30_000 });
    await expect(page.getByTestId("insights-events-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Next 7 days").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Next 30 days").first()).toBeVisible();
    await expect(page.getByText("Next 90 days").first()).toBeVisible();
    await expect(page.getByTestId("insights-events-readiness")).toBeVisible();
    await expect(page.getByTestId("insights-cancellations")).toBeVisible();
    await expect(page.getByText("Calendar load").first()).toBeVisible();
    await expect(page.getByText("Turnout vs expected").first()).toBeVisible();

    await tabs.getByRole("link", { name: "Crew" }).click();
    await expect(page.getByTestId("insights-crew-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Fill rate").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("insights-busiest-crew")).toBeVisible();
    await expect(page.getByText("Overtime risk").first()).toBeVisible();

    await tabs.getByRole("link", { name: "Ops" }).click();
    await expect(page.getByTestId("insights-ops-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("insights-stat-owed-artists")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Open damage").first()).toBeVisible();
    await expect(page.getByTestId("insights-payout-queue")).toBeVisible();
    await expect(page.getByText("Rental fulfillment").first()).toBeVisible();
  });

  test("a custom range uses the date pickers, not native inputs", async ({ page }) => {
    await page.goto("/dashboard/financial-hub/insights/demand?from=2026-01-01&to=2026-03-31");
    const range = page.getByTestId("insights-range");
    await expect(range).toBeVisible({ timeout: 30_000 });
    await expect(range.getByRole("radio", { name: "Custom" })).toHaveAttribute("aria-checked", "true");
    await expect(range.getByTestId("date-picker").first()).toHaveAttribute("data-value", "2026-01-01");
    await expect(range.locator('input[type="date"]')).toHaveCount(0);
    await expect(page.getByTestId("insights-demand-panel")).toBeVisible({ timeout: 30_000 });
  });

  test("Financial Hub shows live Revenue/Expenses cards and links to Insights", async ({
    page,
  }) => {
    await page.goto("/dashboard/financial-hub");
    await expect(page.getByText("Coming soon.")).toHaveCount(0, { timeout: 30_000 });

    const revenueCard = page.locator("[data-slot='card']").filter({ hasText: "Revenue" }).first();
    await expect(revenueCard.getByText("Recognized (paid)", { exact: false })).toBeVisible({
      timeout: 30_000,
    });
    await expect(revenueCard.getByRole("link", { name: "Open Insights" })).toBeVisible();

    const expensesCard = page.locator("[data-slot='card']").filter({ hasText: "Expenses" }).first();
    await expect(
      expensesCard.getByText("Recorded event costs (includes artist payouts", { exact: false }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("link", { name: "Insights", exact: true }).first().click();
    await page.waitForURL(/\/dashboard\/financial-hub\/insights/, { timeout: 30_000 });
    await expect(page.getByTestId("insights-page")).toBeVisible({ timeout: 30_000 });
  });

  test("crew scheduling header shows fill-rate KPIs", async ({ page }) => {
    await page.goto("/dashboard/events/crew-scheduling");
    await expect(page.getByText("Date range").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Slots filled").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Open slots").first()).toBeVisible();
    await expect(page.getByText("Events needing crew").first()).toBeVisible();
  });

  test("admin can open the Feedback tab and read full client feedback", async ({ page }) => {
    test.setTimeout(120_000);

    const seeded = runConvex("e2eHelpers:seedEventFeedbackForInsights", {}) as {
      eventTitle: string;
      invoiceNumber: string;
      comments: string;
    };

    await page.goto("/dashboard/financial-hub/insights");
    const insights = page.getByTestId("insights-page");
    await expect(insights).toBeVisible({ timeout: 30_000 });

    await page.getByRole("navigation", { name: "Insights sections" }).getByRole("link", { name: "Feedback" }).click();
    await expect(page.getByTestId("insights-feedback-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Responses").first()).toBeVisible({ timeout: 30_000 });

    // Summary cards render for the seeded response.
    await expect(page.getByText("Average rating").first()).toBeVisible();
    await expect(page.getByText("Rated 4 or 5").first()).toBeVisible();

    // Full feedback is readable verbatim (unique per seed run).
    await expect(page.getByText(seeded.eventTitle).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(seeded.invoiceNumber).first()).toBeVisible();
    await expect(page.getByText(seeded.comments, { exact: true })).toBeVisible();
  });

  test("admin can read day-of lead post-mortems in the Feedback tab", async ({ page }) => {
    test.setTimeout(120_000);

    const seeded = runConvex("e2eHelpers:seedPostMortemForInsights", {}) as {
      eventTitle: string;
      leadName: string;
      whatWentWell: string;
      whatCouldImprove: string;
    };

    await page.goto("/dashboard/financial-hub/insights");
    const insights = page.getByTestId("insights-page");
    await expect(insights).toBeVisible({ timeout: 30_000 });

    await page.getByRole("navigation", { name: "Insights sections" }).getByRole("link", { name: "Feedback" }).click();
    await expect(page.getByTestId("insights-postmortem-panel")).toBeVisible({ timeout: 30_000 });

    // Summary cards render for the seeded response.
    await expect(page.getByText("Post-mortems").first()).toBeVisible({ timeout: 30_000 });

    // Post-mortem answers are readable verbatim (unique per seed run).
    await expect(page.getByText(seeded.eventTitle).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(seeded.leadName).first()).toBeVisible();
    await expect(page.getByText(seeded.whatWentWell, { exact: true })).toBeVisible();
    await expect(page.getByText(seeded.whatCouldImprove, { exact: true })).toBeVisible();
  });
});
