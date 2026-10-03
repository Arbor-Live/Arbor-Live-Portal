import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";

test.describe("event header invoice link", () => {
  test("admin sees a link from the event header to its invoice", async ({ page }, testInfo) => {
    const seeded = runConvex("e2eHelpers:seedApprovedQuoteWithLinkedEvent", {
      clientGroupName: `E2E Header Link Host ${Date.now()}`,
    }) as { eventId: string; invoiceId: string; invoiceNumber: string };

    await page.goto(`/dashboard/events/${seeded.eventId}`);
    const link = page.getByTestId("event-invoice-link");
    await expect(link).toBeVisible({ timeout: 45_000 });
    await expect(link).toHaveText(`Invoice ${seeded.invoiceNumber}`);
    await expect(link).toHaveAttribute(
      "href",
      `/dashboard/financial-hub/invoices/${seeded.invoiceId}`,
    );
    await page.screenshot({ path: testInfo.outputPath("header-invoice-link.png") });
  });
});
