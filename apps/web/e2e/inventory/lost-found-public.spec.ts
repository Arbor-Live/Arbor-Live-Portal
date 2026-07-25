import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";

test.describe("public lost and found", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("a tagged asset renders its public /e/{assetId} record", async ({ page }) => {
    const seeded = runConvex("e2eHelpers:seedLostFoundAsset", {}) as {
      assetId: string;
      typeName: string;
      publicPath: string;
    };

    await page.goto(seeded.publicPath);
    await expect(page.getByText("Asset Record").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(seeded.assetId).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(seeded.typeName).first()).toBeVisible({ timeout: 20_000 });
  });

  test("an unknown asset tag shows the not-found state", async ({ page }) => {
    await page.goto(`/e/E2E-DOES-NOT-EXIST-${Date.now()}`);
    await expect(page.getByText("Equipment not found").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText("Unknown asset").first()).toBeVisible({ timeout: 20_000 });
  });
});
