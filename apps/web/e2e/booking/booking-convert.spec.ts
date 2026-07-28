import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

test.describe("booking staff convert", () => {
  test("admin converts a submitted request into quote + tentative crewed event", async ({ page }) => {
    const eventName = `E2E Convert ${Date.now()}`;
    const seeded = runConvex("e2eHelpers:seedSubmittedBookingRequest", {
      eventName,
    }) as {
      requestId: string;
      path: string;
      requestNumber: string;
    };

    await page.goto(seeded.path);
    await expect(page.getByText(seeded.requestNumber).first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText("submitted", { exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "Create quote & tentative event" }).click();
    await page.waitForURL(/\/dashboard\/financial-hub\/invoices\//, { timeout: 45_000 });

    // Leave the invoice editor immediately — assert conversion via helpers + request detail.
    await page.goto(seeded.path);
    await expect(page.getByText("converted", { exact: true }).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByRole("link", { name: /Open tentative event/i }).first()).toBeVisible();

    const state = await pollConvex<{
      status: string;
      convertedEventId: string | null;
      linkedInvoiceId: string | null;
      convertedAt: number | null;
      eventType: string | null;
      startAt: number | null;
      endAt: number | null;
      requestStartAt: number | null;
      requestEndAt: number | null;
    }>(
      "e2eHelpers:getBookingRequestState",
      { requestId: seeded.requestId },
      (row) =>
        row?.status === "converted" &&
        Boolean(row.convertedEventId) &&
        Boolean(row.linkedInvoiceId) &&
        row.convertedAt != null,
    );
    expect(state.status).toBe("converted");
    expect(state.convertedEventId).toBeTruthy();
    expect(state.linkedInvoiceId).toBeTruthy();
    expect(state.convertedAt).toBeTruthy();
    expect(state.eventType).toBe("Crewed Event");
    expect(state.startAt).toBe(state.requestStartAt);
    expect(state.endAt).toBe(state.requestEndAt);
  });
});
