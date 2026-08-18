import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { pickSearchableOption } from "../helpers/select";
import {
  deleteInventoryFixtures,
  itemRow,
  waitForInventoryItem,
} from "../helpers/inventory";

const stamp = Date.now();
const suffix = String(stamp).slice(-6);
const typeName = `E2E Wizard Type ${stamp}`;
const caseAssetId = `E2E-WIZ-CASE-${suffix}`;
const innerAssetId = `E2E-WIZ-MIC-${suffix}`;
const cycleA = `E2E-WIZ-A-${suffix}`;
const cycleB = `E2E-WIZ-B-${suffix}`;
const locationName = `E2E Wizard Shelf ${suffix}`;

/**
 * The create-asset wizard: a three-step sheet that creates several inventory
 * items of one type in a single batch, with containment wired by assetId so
 * sibling tags can nest inside each other before any of them exist.
 */
test.describe.serial("create-asset wizard", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => {
    runConvex("e2eHelpers:ensureInventoryCategory", { key: "misc", label: "Misc" });
    runConvex("e2eHelpers:seedInventoryType", { name: typeName, category: "misc" });
    runConvex("e2eHelpers:seedStorageLocation", { name: locationName });
  });

  test.afterAll(() => {
    deleteInventoryFixtures({
      assetIds: [caseAssetId, innerAssetId],
      typeNames: [typeName],
      locationNames: [locationName],
    });
  });

  test("creates two assets in one batch, one nested in the other, inheriting the container's location", async ({
    page,
  }) => {
    await page.goto("/dashboard/inventory/items");
    await expect(page.getByRole("heading", { name: "Inventory Items" })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "New Item", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Create assets" });
    await expect(sheet).toBeVisible({ timeout: 30_000 });

    // Step 1 — brand & model.
    await pickSearchableOption(
      page,
      sheet.getByTestId("wizard-type-field").getByTestId("searchable-select-trigger"),
      typeName,
      new RegExp(`^${typeName}`),
    );
    await sheet.getByRole("button", { name: "Continue", exact: true }).click();

    // Step 2 — the case gets a storage location, the mic nests inside it.
    const caseCard = sheet.getByTestId("wizard-tag-0");
    await caseCard.getByLabel("Asset ID").fill(caseAssetId);
    await pickSearchableOption(
      page,
      caseCard.getByTestId("wizard-location-field").getByTestId("searchable-select-trigger"),
      locationName,
      locationName,
    );

    await sheet.getByRole("button", { name: "Add another asset", exact: true }).click();
    const innerCard = sheet.getByTestId("wizard-tag-1");
    await innerCard.getByLabel("Asset ID").fill(innerAssetId);
    await pickSearchableOption(
      page,
      innerCard.getByTestId("wizard-container-field").getByTestId("searchable-select-trigger"),
      caseAssetId,
      new RegExp(`^${caseAssetId}`),
    );

    await sheet.getByRole("button", { name: "Continue", exact: true }).click();

    // Step 3 — review both tags, then create.
    await expect(sheet.getByTestId("wizard-review-tag-0")).toContainText(caseAssetId);
    await expect(sheet.getByTestId("wizard-review-tag-1")).toContainText(innerAssetId);
    await sheet.getByRole("button", { name: /^Create 2 items/ }).click();
    await expect(sheet).toHaveCount(0, { timeout: 30_000 });

    // The mic sits inside the case and inherits its location.
    const inner = await waitForInventoryItem(innerAssetId, (state) => Boolean(state?.itemId));
    expect(inner.containedInAssetId).toBe(caseAssetId);
    expect(inner.storageLocationPath).toBe(locationName);

    const outer = await waitForInventoryItem(caseAssetId, (state) => state?.contains.length === 1);
    expect(outer.contains).toEqual([
      { assetId: innerAssetId, storageLocationPath: locationName },
    ]);
  });

  test("refuses a cyclic containment between two new tags", async ({ page }) => {
    await page.goto("/dashboard/inventory/items");
    await expect(page.getByRole("heading", { name: "Inventory Items" })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "New Item", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Create assets" });
    await expect(sheet).toBeVisible({ timeout: 30_000 });

    await pickSearchableOption(
      page,
      sheet.getByTestId("wizard-type-field").getByTestId("searchable-select-trigger"),
      typeName,
      new RegExp(`^${typeName}`),
    );
    await sheet.getByRole("button", { name: "Continue", exact: true }).click();

    const aCard = sheet.getByTestId("wizard-tag-0");
    await aCard.getByLabel("Asset ID").fill(cycleA);

    // B must exist as a sibling before A can nest inside it.
    await sheet.getByRole("button", { name: "Add another asset", exact: true }).click();
    const bCard = sheet.getByTestId("wizard-tag-1");
    await bCard.getByLabel("Asset ID").fill(cycleB);

    await pickSearchableOption(
      page,
      aCard.getByTestId("wizard-container-field").getByTestId("searchable-select-trigger"),
      cycleB,
      new RegExp(`^${cycleB}`),
    );
    await pickSearchableOption(
      page,
      bCard.getByTestId("wizard-container-field").getByTestId("searchable-select-trigger"),
      cycleA,
      new RegExp(`^${cycleA}`),
    );

    await sheet.getByRole("button", { name: "Continue", exact: true }).click();
    await sheet.getByRole("button", { name: /^Create \d+ items?/ }).click();

    // `createMany` detects the cycle and refuses the whole batch; nothing lands.
    await expect(sheet).toContainText("cyclical asset containment", { timeout: 30_000 });
    expect(
      (runConvex("e2eHelpers:getInventoryItemByAssetId", { assetId: cycleA }) as {
        itemId: string;
      } | null)?.itemId,
    ).toBeUndefined();
  });

  test("scan-to-select highlights and selects an existing row", async ({ page }) => {
    const state = runConvex("e2eHelpers:getInventoryItemByAssetId", {
      assetId: caseAssetId,
    }) as { itemId: string } | null;
    expect(state?.itemId).toBeTruthy();

    await page.goto("/dashboard/inventory/items");
    await expect(page.getByRole("heading", { name: "Inventory Items" })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Scan", exact: true }).click();
    await page.getByLabel("Scan asset").fill(caseAssetId);
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const row = itemRow(page, state!.itemId);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row.locator("input[type=checkbox]")).toBeChecked({ timeout: 30_000 });
  });
});
