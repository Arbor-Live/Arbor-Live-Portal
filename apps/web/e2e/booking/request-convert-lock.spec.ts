import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";
import { callConvexAs } from "../helpers/convexCall";

type Seed = {
  requestId: string;
  invoiceId: string;
  eventId: string;
  requestNumber: string;
  publicToken: string;
  trackPath: string;
};

/**
 * Once a request is converted it is a terminal record for the inbox: the
 * detail page drops the staff actions panel, and `updateStatus` refuses to
 * move it anywhere else — a guard the UI can't exercise because the buttons
 * are gone, so it is asserted through a direct Convex call.
 */
test.describe("converted booking request lock", () => {
  const stamp = Date.now();
  let seeded: Seed;

  test.beforeAll(() => {
    seeded = runConvex("e2eHelpers:seedBookingReadyForTrackApprove", {
      eventName: `E2E Convert Lock ${stamp}`,
    }) as Seed;
  });

  test.afterAll(() => {
    runConvex("e2eHelpers:deleteBookingRequestFixture", { requestId: seeded.requestId });
  });

  test("staff actions are hidden once a request is converted", async ({ page }) => {
    const path = `/dashboard/events/requests/${seeded.requestId}`;
    await page.goto(path);
    await expect(page.getByText(seeded.requestNumber).first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText("converted", { exact: true }).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText("Staff actions")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create quote & tentative event" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Open tentative event/i }).first()).toBeVisible();
  });

  test("the backend refuses to update a converted request", async ({ page }) => {
    await page.goto(`/dashboard/events/requests/${seeded.requestId}`);
    await expect(page.getByText(seeded.requestNumber).first()).toBeVisible({ timeout: 25_000 });

    const result = await callConvexAs(page, "mutation", "eventRequests:updateStatus", {
      id: seeded.requestId,
      status: "in_review",
    });
    expect(result.status).toBe("error");
    expect(result.errorMessage ?? "").toMatch(/converted requests cannot be updated/i);

    const state = await pollConvex<{ status: string }>(
      "e2eHelpers:getBookingRequestState",
      { requestId: seeded.requestId },
      (row) => row?.status === "converted",
    );
    expect(state.status).toBe("converted");
  });
});
