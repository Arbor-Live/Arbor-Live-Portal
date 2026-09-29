import { test, expect, type Page } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import {
  addFilter,
  deleteInventoryFixtures,
  gotoTypes,
  searchTypes,
  typeRow,
} from "../helpers/inventory";

const stamp = Date.now();
const suffix = String(stamp).slice(-6);
const prefix = `E2E Filter ${stamp}`;
const capabilityKey = `e2efilt${suffix}`;
const capabilityLabel = `E2E Filter Cap ${suffix}`;
const assetId = `E2E-FILT-${suffix}`;
const otherAssetId = `E2E-FILT2-${suffix}`;

const types = {
  soundWithUnits: { name: `${prefix} Sound`, category: "sound", capabilities: [capabilityKey] },
  lightingEmpty: { name: `${prefix} Lighting`, category: "lighting", capabilities: [] },
  miscWithUnits: { name: `${prefix} Misc`, category: "misc", capabilities: [] },
};

let ids: Record<keyof typeof types, string>;

/**
 * The shared `FilterBar` on the types page. Every chip is a server-side
 * argument to `inventoryTypes.list` (`is` / `is not` any of several values),
 * so these assert rows the server returned, scoped by a search for this run's
 * types.
 */
test.describe.serial("types filter bar", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => {
    for (const [key, label] of [
      ["sound", "Sound"],
      ["lighting", "Lighting"],
      ["misc", "Misc"],
    ]) {
      runConvex("e2eHelpers:ensureInventoryCategory", { key, label });
    }
    runConvex("e2eHelpers:ensureInventoryCapability", { key: capabilityKey, label: capabilityLabel });
    ids = Object.fromEntries(
      Object.entries(types).map(([key, type]) => [
        key,
        (runConvex("e2eHelpers:seedInventoryType", type) as { typeId: string }).typeId,
      ]),
    ) as typeof ids;
    runConvex("e2eHelpers:seedInventoryItem", { assetId, typeName: types.soundWithUnits.name });
    runConvex("e2eHelpers:seedInventoryItem", { assetId: otherAssetId, typeName: types.miscWithUnits.name });
  });

  test.afterAll(() => {
    deleteInventoryFixtures({
      assetIds: [assetId, otherAssetId],
      typeNames: Object.values(types).map((type) => type.name),
      capabilityKeys: [capabilityKey],
    });
  });

  async function expectRows(page: Page, shown: (keyof typeof types)[]) {
    for (const key of Object.keys(types) as (keyof typeof types)[]) {
      const row = typeRow(page, ids[key]);
      if (shown.includes(key)) await expect(row).toBeVisible({ timeout: 30_000 });
      else await expect(row).toHaveCount(0, { timeout: 30_000 });
    }
  }

  test("a multi-value chip matches any of its values, and flips to is not", async ({ page }) => {
    await gotoTypes(page);
    await searchTypes(page, prefix);
    await expectRows(page, ["soundWithUnits", "lightingEmpty", "miscWithUnits"]);

    await addFilter(page, "Category", ["Sound", "Lighting"]);
    await expect(page.getByTestId("filter-chip-category")).toContainText("Category is Sound, Lighting");
    await expectRows(page, ["soundWithUnits", "lightingEmpty"]);

    // Reopen the chip and negate it: the same values now exclude.
    await page.getByTestId("filter-chip-category").getByRole("button").first().click();
    await page.getByTestId("filter-menu-category").getByRole("radio", { name: "is not" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("filter-chip-category")).toContainText("Category is not Sound, Lighting");
    await expectRows(page, ["miscWithUnits"]);
  });

  test("units and capability chips combine, and Clear all resets them", async ({ page }) => {
    await gotoTypes(page);
    await searchTypes(page, prefix);

    await addFilter(page, "Units", ["Has units"]);
    await expectRows(page, ["soundWithUnits", "miscWithUnits"]);

    await addFilter(page, "Capability", [capabilityLabel], "is not");
    await expectRows(page, ["miscWithUnits"]);

    // Removing one chip leaves the other applied.
    await page.getByRole("button", { name: "Remove the Units filter" }).click();
    await expectRows(page, ["lightingEmpty", "miscWithUnits"]);

    await page.getByTestId("filter-chips").getByRole("button", { name: "Clear all" }).click();
    await expect(page.getByTestId("filter-chips")).toHaveCount(0);
    await expectRows(page, ["soundWithUnits", "lightingEmpty", "miscWithUnits"]);
  });

  test("a chip closed without a value is dropped", async ({ page }) => {
    await gotoTypes(page);
    await page.getByTestId("filter-bar").getByRole("button", { name: /^Filter/ }).click();
    await page.getByRole("menuitem", { name: "Manufacturer", exact: true }).click();
    await expect(page.getByTestId("filter-menu-manufacturer")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("filter-chip-manufacturer")).toHaveCount(0);
  });
});
