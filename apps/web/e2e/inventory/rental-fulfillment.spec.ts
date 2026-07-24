import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

test.describe("rental fulfillment", () => {
  test("admin can process delivery and return with typed asset scans", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedDryHireWithPullList", {
      title: `E2E Fulfill ${Date.now()}`,
    }) as {
      eventId: string;
      assetId: string;
      equipmentPath: string;
    };

    await page.goto(seeded.equipmentPath);
    await expect(page.getByRole("button", { name: "Process delivery" })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Process delivery" }).click();
    await expect(page.getByText("Process delivery").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Start delivery" }).click();
    await expect(page.getByText(/1 remaining|Awaiting scan|0 \/ 1/i).first()).toBeVisible({
      timeout: 20_000,
    });

    await page.locator("#asset-scan-input").fill(seeded.assetId);
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText(seeded.assetId).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Complete delivery" }).click();
    await expect(page.getByText(/Delivery already completed|Rented|Complete/i).first()).toBeVisible({
      timeout: 25_000,
    });

    const afterDelivery = await pollConvex<{
      outboundCompleted: boolean;
      scannedAssetIds: string[];
    }>(
      "e2eHelpers:getRentalFulfillmentState",
      { eventId: seeded.eventId },
      (row) => Boolean(row?.outboundCompleted),
    );
    expect(afterDelivery.outboundCompleted).toBe(true);
    expect(afterDelivery.scannedAssetIds).toContain(seeded.assetId);

    // Close sheet if still open, then run return.
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Process return" }).click();
    await expect(page.getByText("Process return").first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Start return" }).click();
    await page.locator("#asset-scan-input").fill(seeded.assetId);
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText(seeded.assetId).first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole("button", { name: "Complete return" }).click();

    const afterReturn = await pollConvex<{
      outboundCompleted: boolean;
      returnCompleted: boolean;
    }>(
      "e2eHelpers:getRentalFulfillmentState",
      { eventId: seeded.eventId },
      (row) => Boolean(row?.returnCompleted),
    );
    expect(afterReturn.outboundCompleted).toBe(true);
    expect(afterReturn.returnCompleted).toBe(true);
  });
});
