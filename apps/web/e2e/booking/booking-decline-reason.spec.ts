import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

test.describe("booking decline instrumentation", () => {
  test("admin declines a request with a reason code", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedSubmittedBookingRequest", {
      eventName: `E2E Decline ${Date.now()}`,
    }) as {
      requestId: string;
      path: string;
    };

    await page.goto(seeded.path);
    await expect(page.getByText("submitted", { exact: true }).first()).toBeVisible({
      timeout: 25_000,
    });

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
    }>(
      "e2eHelpers:getBookingRequestState",
      { requestId: seeded.requestId },
      (row) => row?.status === "declined" && row.declineReasonCode === "capacity" && row.declinedAt != null,
    );
    expect(state.declineReasonCode).toBe("capacity");
    expect(state.declinedAt).toBeTruthy();
  });
});
