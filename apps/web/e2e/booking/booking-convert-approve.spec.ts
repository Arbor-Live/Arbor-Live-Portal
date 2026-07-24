import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";

test.describe("booking convert and track approve", () => {
  test("staff convert → ready for review → client approves on track link", async ({
    page,
    browser,
  }) => {
    const seeded = runConvex("e2eHelpers:seedSubmittedBookingRequest", {
      eventName: `E2E Convert ${Date.now()}`,
    }) as {
      path: string;
      trackPath: string;
      publicToken: string;
    };

    await page.goto(seeded.path);
    await expect(page.getByRole("button", { name: "Create quote & tentative event" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Create quote & tentative event" }).click();
    await page.waitForURL(/\/dashboard\/financial-hub\/invoices\//, { timeout: 45_000 });

    await expect(page.getByRole("button", { name: "Ready for review" })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Ready for review" }).click();
    await expect(page.getByRole("button", { name: "Withdraw" })).toBeVisible({ timeout: 20_000 });

    // Use an isolated unauthenticated context so we don't wipe admin storageState
    // for later tests in this worker.
    const publicContext = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      baseURL: test.info().project.use.baseURL,
    });
    const publicPage = await publicContext.newPage();
    try {
      await publicPage.goto(seeded.trackPath);
      await expect(publicPage.getByText(/Terms & Conditions|Approve quote/i).first()).toBeVisible({
        timeout: 25_000,
      });

      await publicPage.getByPlaceholder("Jordan Lee").fill("E2E Track Approver");
      await publicPage.getByText("I will be submitting the payment").click();
      await publicPage.getByRole("button", { name: "Approve quote" }).click();
      await expect(publicPage.getByText(/Approved on/i).first()).toBeVisible({ timeout: 20_000 });
    } finally {
      await publicContext.close();
    }
  });
});
