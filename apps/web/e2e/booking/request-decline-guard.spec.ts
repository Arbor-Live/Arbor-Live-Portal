import { test, expect, type Browser, type Page } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";
import { callConvexAs } from "../helpers/convexCall";

type Seed = {
  requestId: string;
  requestNumber: string;
  publicToken: string;
  path: string;
  trackPath: string;
};

async function assertSubmitted(page: Page, requestId: string) {
  await pollConvex<{ status: string }>(
    "e2eHelpers:getBookingRequestState",
    { requestId },
    (row) => row?.status === "submitted",
  );
}

/**
 * The decline lifecycle beyond the happy path the original spec covered:
 * the client-side refusal when no reason is picked, the *server-side* refusal
 * when the UI guard is bypassed, the terminal state on the detail page, and the
 * declined mirror on the client's public tracking link.
 */
test.describe("booking request decline lifecycle", () => {
  const stamp = Date.now();
  let seeded: Seed;

  test.beforeAll(() => {
    seeded = runConvex("e2eHelpers:seedSubmittedBookingRequest", {
      eventName: `E2E Decline ${stamp}`,
    }) as Seed;
  });

  test.afterAll(() => {
    runConvex("e2eHelpers:deleteBookingRequestFixture", { requestId: seeded.requestId });
  });

  test("declining without a reason is refused, then a real decline sticks", async ({ page }) => {
    await page.goto(seeded.path);
    await expect(page.getByText(seeded.requestNumber).first()).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText("submitted", { exact: true }).first()).toBeVisible();

    // Client-side refusal: no reason selected → nothing is written.
    await page.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(page.getByText("Select a decline reason.")).toBeVisible();
    await assertSubmitted(page, seeded.requestId);

    // Server-side refusal: the same call with the UI guard bypassed.
    const serverResult = await callConvexAs(page, "mutation", "eventRequests:updateStatus", {
      id: seeded.requestId,
      status: "declined",
    });
    expect(serverResult.status).toBe("error");
    expect(serverResult.errorMessage ?? "").toMatch(/decline reason/i);
    await assertSubmitted(page, seeded.requestId);

    // The real decline.
    await page.getByLabel("Decline reason").selectOption("capacity");
    await page.getByLabel("Decline note (optional)").fill("Fully booked that weekend");
    await page.getByRole("button", { name: "Decline", exact: true }).click();

    await expect(page.getByText("declined", { exact: true }).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText("At capacity / unavailable")).toBeVisible();

    const state = await pollConvex<{
      status: string;
      declineReasonCode: string | null;
      declinedAt: number | null;
      reviewedByUserId: string | null;
    }>(
      "e2eHelpers:getBookingRequestState",
      { requestId: seeded.requestId },
      (row) => row?.status === "declined" && row.declineReasonCode === "capacity" && row.declinedAt != null,
    );
    expect(state.declineReasonCode).toBe("capacity");
    expect(state.declinedAt).toBeTruthy();
    expect(state.reviewedByUserId).toBeTruthy();
  });

  test("the staff actions panel leaves after decline and the client portal mirrors it", async ({
    browser,
    page,
  }: {
    browser: Browser;
    page: Page;
  }) => {
    await page.goto(seeded.path);
    await expect(page.getByText("declined", { exact: true }).first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(page.getByText("Staff actions")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Create quote & tentative event" })).toHaveCount(0);

    // The client's tracking link shows the declined state, not the lifecycle steps.
    const clientContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const clientPage = await clientContext.newPage();
    await clientPage.goto(seeded.trackPath);
    await expect(clientPage.getByText("Status: Declined").first()).toBeVisible({
      timeout: 25_000,
    });
    await expect(clientPage.getByText(/This request was declined/)).toBeVisible();
    await clientContext.close();
  });
});
