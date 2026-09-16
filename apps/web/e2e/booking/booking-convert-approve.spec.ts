import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

test.describe("booking track approve", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("client approves a booking quote on the request track link", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedBookingReadyForTrackApprove", {
      eventName: `E2E Track Approve ${Date.now()}`,
    }) as {
      requestId: string;
      trackPath: string;
    };

    await page.goto(`${seeded.trackPath}?tab=quote`);
    await expect(page.getByText(/Terms & Conditions|Approve quote/i).first()).toBeVisible({
      timeout: 25_000,
    });

    await page.getByPlaceholder("Jordan Lee").fill("E2E Track Approver");
    await page.getByText("I will be submitting the payment").click();
    await page.getByRole("button", { name: "Approve quote" }).click();
    await expect(page.getByText(/Approved on/i).first()).toBeVisible({ timeout: 20_000 });

    const state = await pollConvex<{ status: string; convertedAt: number | null }>(
      "e2eHelpers:getBookingRequestState",
      { requestId: seeded.requestId },
      (row) => row?.status === "converted" && row.convertedAt != null,
    );
    expect(state.status).toBe("converted");
    expect(state.convertedAt).toBeTruthy();
  });
});
