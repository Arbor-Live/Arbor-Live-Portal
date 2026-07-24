import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";

test.describe("booking track approve", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("client approves a booking quote on the request track link", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedBookingReadyForTrackApprove", {
      eventName: `E2E Track Approve ${Date.now()}`,
    }) as {
      trackPath: string;
    };

    await page.goto(seeded.trackPath);
    await expect(page.getByText(/Terms & Conditions|Approve quote/i).first()).toBeVisible({
      timeout: 25_000,
    });

    await page.getByPlaceholder("Jordan Lee").fill("E2E Track Approver");
    await page.getByText("I will be submitting the payment").click();
    await page.getByRole("button", { name: "Approve quote" }).click();
    await expect(page.getByText(/Approved on/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
