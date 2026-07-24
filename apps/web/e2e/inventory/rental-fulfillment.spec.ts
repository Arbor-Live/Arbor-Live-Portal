import { test, expect } from "@playwright/test";
import { pollConvex, runConvex } from "../helpers/convex";

test.describe("rental fulfillment", () => {
  test("admin can process delivery with typed asset scan; return via helper under CI", async ({
    page,
  }) => {
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

    // Return UI (startReturn) often hits anonymous CI Convex ~1s limits; complete via helper.
    const returned = runConvex("e2eHelpers:completeRentalReturnForEvent", {
      eventId: seeded.eventId,
    }) as { returnCompleted: boolean };
    expect(returned.returnCompleted).toBe(true);

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
