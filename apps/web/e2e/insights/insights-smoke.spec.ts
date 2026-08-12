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
    await expect(page.getByText("Insights").first()).toBeVisible();

    // Default Finances tab
    await expect(page.getByTestId("insights-finances-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Recognized revenue").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Booked ahead (90d)").first()).toBeVisible();
    await expect(page.getByText("AR snapshot").first()).toBeVisible();

    await insights.getByRole("button", { name: "Demand", exact: true }).click();
    await expect(page.getByTestId("insights-demand-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Upcoming (30d)").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Booking funnel").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Decline reasons").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Quote engagement").first()).toBeVisible();
    await expect(page.getByText("Delivery quality").first()).toBeVisible();
    await expect(page.getByText("Calendar load").first()).toBeVisible();

    await insights.getByRole("button", { name: "Events", exact: true }).click();
    await expect(page.getByTestId("insights-events-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Next 7 days").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Next 30 days").first()).toBeVisible();
    await expect(page.getByText("Next 90 days").first()).toBeVisible();
    await expect(page.getByText("Booked ahead").first()).toBeVisible();
    await expect(page.getByText("Ops readiness").first()).toBeVisible();
    await expect(page.getByText("Upcoming by status").first()).toBeVisible();

    await insights.getByRole("button", { name: "Crew", exact: true }).click();
    await expect(page.getByTestId("insights-crew-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Fill rate").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("OT / DT risk").first()).toBeVisible();

    await insights.getByRole("button", { name: "Ops", exact: true }).click();
    await expect(page.getByTestId("insights-ops-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Band payouts").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Open damage").first()).toBeVisible();
    await expect(page.getByText("Payout queue aging").first()).toBeVisible();
    await expect(page.getByText("Fulfillment duration").first()).toBeVisible();
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
      expensesCard.getByText("Recorded event costs (includes band payouts)", { exact: false }),
    ).toBeVisible({ timeout: 30_000 });

    await page.getByRole("link", { name: "Insights", exact: true }).first().click();
    await page.waitForURL(/\/dashboard\/financial-hub\/insights/, { timeout: 30_000 });
    await expect(page.getByTestId("insights-page")).toBeVisible({ timeout: 30_000 });
  });

  test("crew scheduling header shows fill-rate KPIs", async ({ page }) => {
    await page.goto("/dashboard/events/crew-scheduling");
    await expect(page.getByText("Date range").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Fill rate").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Unfilled shifts").first()).toBeVisible();
    await expect(page.getByText("Unconfirmed events").first()).toBeVisible();
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

    await insights.getByRole("button", { name: "Feedback", exact: true }).click();
    await expect(page.getByTestId("insights-feedback-panel")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Responses").first()).toBeVisible({ timeout: 30_000 });

    // Summary cards render for the seeded response.
    await expect(page.getByText("Average rating").first()).toBeVisible();
    await expect(page.getByText("Rating distribution").first()).toBeVisible();

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

    await insights.getByRole("button", { name: "Feedback", exact: true }).click();
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
