import { test, expect, type Page } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { addFilter, deleteInventoryFixtures, itemRow } from "../helpers/inventory";

const stamp = Date.now();
const suffix = String(stamp).slice(-6);
const prefix = `E2E-IF-${suffix}`;
const soundType = `E2E Item Filter Sound ${stamp}`;
const lightingType = `E2E Item Filter Lighting ${stamp}`;
const shelf = `E2E Item Filter Shelf ${suffix}`;

const assets = {
  soundShelved: `${prefix}-A`,
  soundLoose: `${prefix}-B`,
  lightingLoose: `${prefix}-C`,
};

let ids: Record<keyof typeof assets, string>;

/**
 * The FilterBar on the items page. Type and Location are server-side arguments
 * to `inventoryItems.list`; "Unassigned" is the `none` location value.
 */
test.describe.serial("items filter bar", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => {
    runConvex("e2eHelpers:ensureInventoryCategory", { key: "sound", label: "Sound" });
    runConvex("e2eHelpers:ensureInventoryCategory", { key: "lighting", label: "Lighting" });
    runConvex("e2eHelpers:seedInventoryType", { name: soundType, category: "sound" });
    runConvex("e2eHelpers:seedInventoryType", { name: lightingType, category: "lighting" });
    const location = runConvex("e2eHelpers:seedStorageLocation", { name: shelf }) as { path: string };
    const seed = (assetId: string, typeName: string, storageLocationPath?: string) =>
      (runConvex("e2eHelpers:seedInventoryItem", { assetId, typeName, storageLocationPath }) as { itemId: string })
        .itemId;
    ids = {
      soundShelved: seed(assets.soundShelved, soundType, location.path),
      soundLoose: seed(assets.soundLoose, soundType),
      lightingLoose: seed(assets.lightingLoose, lightingType),
    };
  });

  test.afterAll(() => {
    deleteInventoryFixtures({
      assetIds: Object.values(assets),
      typeNames: [soundType, lightingType],
      locationNames: [shelf],
    });
  });

  async function expectRows(page: Page, shown: (keyof typeof assets)[]) {
    for (const key of Object.keys(assets) as (keyof typeof assets)[]) {
      const row = itemRow(page, ids[key]);
      if (shown.includes(key)) await expect(row).toBeVisible({ timeout: 30_000 });
      else await expect(row).toHaveCount(0, { timeout: 30_000 });
    }
  }

  test("type and location chips narrow the list on the server", async ({ page }) => {
    await page.goto("/dashboard/inventory/items");
    await page.getByRole("textbox", { name: "Search items" }).fill(prefix);
    await expectRows(page, ["soundShelved", "soundLoose", "lightingLoose"]);

    await addFilter(page, "Type", [new RegExp(`^${soundType} /`)]);
    await expectRows(page, ["soundShelved", "soundLoose"]);

    await addFilter(page, "Location", ["Unassigned"]);
    await expectRows(page, ["soundLoose"]);

    await page.getByRole("button", { name: "Remove the Type filter" }).click();
    await expectRows(page, ["soundLoose", "lightingLoose"]);

    await page.getByTestId("filter-chips").getByRole("button", { name: "Clear all" }).click();
    await expectRows(page, ["soundShelved", "soundLoose", "lightingLoose"]);
  });
});
