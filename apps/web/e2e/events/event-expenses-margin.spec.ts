import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";

/**
 * Linked-invoice surfaces that regressed when overview invoice list queries
 * were skipped on non-overview tabs, and when `formatUsd` was prefixed with
 * an extra `$`.
 */
test.describe("linked invoice margin and crew rate copy", () => {
  test("event expenses shows linked invoice margin without a loading dead-end", async ({
    page,
  }) => {
    const seeded = runConvex("e2eHelpers:seedApprovedQuoteWithLinkedEvent", {
      clientGroupName: `E2E Margin Host ${Date.now()}`,
    }) as { eventId: string; invoiceId: string };

    await page.goto(`/dashboard/events/${seeded.eventId}/expenses`);
    await expect(page.getByText("Event Costs").first()).toBeVisible({ timeout: 45_000 });

    const margin = page.getByTestId("event-linked-invoice-margin");
    await expect(margin).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("event-linked-invoice-loading")).toHaveCount(0);
    await expect(margin.getByText("Total Billed")).toBeVisible();
    await expect(margin.getByText("$100.00").first()).toBeVisible();
    await expect(margin.getByText("Net profit")).toBeVisible();
  });

  test("invoice crew schedule blurb uses a single dollar sign from formatUsd", async ({
    page,
  }) => {
    const seeded = runConvex("e2eHelpers:seedApprovedQuoteWithLinkedEvent", {
      clientGroupName: `E2E Crew Rate Host ${Date.now()}`,
    }) as { invoiceId: string };

    await page.goto(`/dashboard/financial-hub/invoices/${seeded.invoiceId}`);
    await expect(page.getByRole("heading", { name: "Edit Invoice" })).toBeVisible({
      timeout: 60_000,
    });

    const blurb = page.getByTestId("invoice-linked-crew-blurb");
    await expect(blurb).toBeVisible({ timeout: 45_000 });
    const text = (await blurb.innerText()).replace(/\s+/g, " ");
    expect(text).toMatch(/Open slots bill at the invoice'?s default crew rate \(\$\d+\.\d{2}\/hr\)/);
    expect(text).not.toMatch(/\$\$/);
  });
});
