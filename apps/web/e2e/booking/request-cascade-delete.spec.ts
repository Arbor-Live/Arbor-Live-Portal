import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

type Seed = {
  requestId: string;
  invoiceId: string;
  eventId: string;
  requestNumber: string;
  publicToken: string;
  trackPath: string;
};

/**
 * Admin cascade delete of a booking request. The dialog previews the linked
 * records (draft quote + tentative event) and "Delete all" removes them with
 * the request — which doubles as the fixture's own cleanup, since the request
 * is gone afterwards.
 */
test.describe("admin cascade delete of a booking request", () => {
  const stamp = Date.now();
  const eventName = `E2E Cascade Delete ${stamp}`;
  let seeded: Seed;

  test.beforeAll(() => {
    seeded = runConvex("e2eHelpers:seedBookingReadyForTrackApprove", {
      eventName,
    }) as Seed;
  });

  test("deleting a converted request removes its quote and event", async ({ page }) => {
    const path = `/dashboard/events/requests/${seeded.requestId}`;
    await page.goto(path);
    await expect(page.getByText(seeded.requestNumber).first()).toBeVisible({ timeout: 25_000 });

    await page.getByRole("button", { name: "Delete request" }).click();
    await expect(page.getByText("Delete booking request?")).toBeVisible({ timeout: 25_000 });

    // The preview lists the linked records before it offers the cascade delete.
    // Anchored so it only matches the dialog's `<li>` — the detail page's quote
    // badge renders "Quote ALINV-… · finalized · On request portal" behind it.
    await expect(page.getByText(/^Quote ALINV-[A-Za-z0-9]+$/)).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(`Event: ${eventName}`)).toBeVisible();

    await page.getByRole("button", { name: "Delete all" }).click();

    const state = await pollConvex<{
      requestExists: boolean;
      invoiceExists: boolean;
      eventExists: boolean;
    }>(
      "e2eHelpers:getBookingRequestDeleteState",
      { requestId: seeded.requestId },
      (row) => !row?.requestExists && !row?.invoiceExists && !row?.eventExists,
    );
    expect(state.requestExists).toBe(false);
    expect(state.invoiceExists).toBe(false);
    expect(state.eventExists).toBe(false);

    // The confirm navigates back to the inbox (client-side push; poll the URL).
    await expect
      .poll(async () => page.url(), { timeout: 25_000 })
      .toContain("/dashboard/events/requests");
  });
});
