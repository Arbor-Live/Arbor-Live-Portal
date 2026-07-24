import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

test.describe("rental fulfillment", () => {
  test("admin can process delivery and return with typed asset scans", async ({ page }) => {
    test.setTimeout(120_000);
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
    await expect(page.getByText(/Awaiting scan|1 remaining|0 \/ 1/i).first()).toBeVisible({
      timeout: 20_000,
    });

    const scanInput = page.locator("#asset-scan-input");
    await scanInput.fill(seeded.assetId);
    await expect(page.getByRole("button", { name: "Add" })).toBeEnabled();
    await scanInput.press("Enter");
    // Remaining filter hides scanned rows — assert pack progress instead of asset id text.
    await expect(page.getByText(/all clear|Nothing remaining/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Complete delivery" }).click();
    await expect(
      page.getByText(/Delivery completed|Rented equipment|client was not emailed/i).first(),
    ).toBeVisible({ timeout: 25_000 });

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

    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Process return" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: "Process return" }).click();
    await expect(page.getByRole("heading", { name: "Process return" })).toBeVisible({
      timeout: 15_000,
    });
    const startReturn = page.getByRole("button", { name: "Start return" });
    await expect(startReturn).toBeVisible({ timeout: 15_000 });
    await startReturn.click();
    await expect(page.locator("#asset-scan-input")).toBeVisible({ timeout: 20_000 });

    const returnInput = page.locator("#asset-scan-input");
    await returnInput.fill(seeded.assetId);
    await expect(page.getByRole("button", { name: "Add" })).toBeEnabled();
    await returnInput.press("Enter");
    await expect(page.getByText(/all clear|Nothing remaining/i).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Complete return" }).click();
    await expect(
      page.getByText(/Return completed|client was not emailed|Send client email/i).first(),
    ).toBeVisible({ timeout: 25_000 });

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
