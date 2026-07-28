import { test, expect, type Page } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { formField } from "../helpers/form";
import { pickSearchableOption } from "../helpers/select";
import {
  deleteInventoryFixtures,
  formSaveBar,
  itemRow,
  revealRow,
  waitForInventoryItem,
  waitForStorageLocation,
} from "../helpers/inventory";

const stamp = Date.now();
const suffix = String(stamp).slice(-6);
const typeName = `E2E Asset Type ${stamp}`;
const parentLocation = `E2E Warehouse ${suffix}`;
const childLocation = `E2E Shelf ${suffix}`;
const caseAssetId = `E2E-CASE-${suffix}`;
const contentAssetId = `E2E-MIC-${suffix}`;

/**
 * Storage locations and inventory items, which are one flow rather than two.
 *
 * A location's `path` is composed from its parent's path, and an item's
 * effective location is *not* whatever the form submitted: putting an asset
 * inside a container makes it inherit the container's location, and that
 * inheritance then cascades down every asset nested below it
 * (`cascadeLocationToDescendants`). None of that is visible from the row being
 * edited, which is why the assertions read the child back.
 */
test.describe.serial("inventory items and storage locations", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => {
    runConvex("e2eHelpers:ensureInventoryCategory", { key: "misc", label: "Misc" });
    runConvex("e2eHelpers:seedInventoryType", { name: typeName, category: "misc" });
  });

  test.afterAll(() => {
    deleteInventoryFixtures({
      assetIds: [contentAssetId, caseAssetId],
      typeNames: [typeName],
      locationNames: [childLocation, parentLocation],
    });
  });

  test("admin creates a nested storage location and its path is composed", async ({ page }) => {
    await page.goto("/dashboard/inventory/storage-locations");
    await expect(page.getByRole("heading", { name: "Storage Locations" })).toBeVisible({
      timeout: 30_000,
    });

    const form = page.locator("form");
    await formField(form, "Name").fill(parentLocation);
    await form.getByRole("button", { name: "Create", exact: true }).click();

    const parent = await waitForStorageLocation(parentLocation, (state) => Boolean(state?.path));
    expect(parent.path).toBe(parentLocation);
    expect(parent.parentPath).toBeNull();

    await formField(form, "Name").fill(childLocation);
    await form.locator("select").selectOption(parent.locationId);
    await form.getByRole("button", { name: "Create", exact: true }).click();

    const child = await waitForStorageLocation(childLocation, (state) => Boolean(state?.parentPath));
    expect(child.path).toBe(`${parentLocation} > ${childLocation}`);
    expect(child.parentPath).toBe(parentLocation);

    await expect(page.getByTestId(`location-row-${child.locationId}`)).toContainText(child.path, {
      timeout: 30_000,
    });
  });

  test("admin creates two items, one of them in the shelf", async ({ page }) => {
    const child = await waitForStorageLocation(childLocation, (state) => Boolean(state?.path));

    await page.goto("/dashboard/inventory/items");
    await expect(page.getByRole("heading", { name: "Inventory Items" })).toBeVisible({
      timeout: 30_000,
    });

    await createItem(page, { assetId: caseAssetId, locationPath: child.path });
    const seededCase = await waitForInventoryItem(caseAssetId, (state) => Boolean(state?.itemId));
    expect(seededCase.typeName).toBe(typeName);
    expect(seededCase.storageLocationPath).toBe(child.path);

    // The second asset is deliberately left unassigned so the containment step
    // below has something to inherit.
    await createItem(page, { assetId: contentAssetId, serialNumber: `SN-${suffix}` });
    const content = await waitForInventoryItem(contentAssetId, (state) => Boolean(state?.itemId));
    expect(content.serialNumber).toBe(`SN-${suffix}`);
    expect(content.storageLocationPath).toBeNull();
  });

  test("a duplicate asset ID is refused", async ({ page }) => {
    await page.goto("/dashboard/inventory/items");
    await expect(page.getByRole("heading", { name: "Inventory Items" })).toBeVisible({
      timeout: 30_000,
    });

    await createItem(page, { assetId: caseAssetId, submitOnly: true });

    // `inventoryItems.create` throws on a duplicate `assetId`, and the editor's
    // save bar is where that lands — asset IDs are printed on physical labels,
    // so a silent second row would be worse than a refusal.
    //
    // Scoped to the bar, not the page: in dev the Next.js error overlay renders
    // the raw `[CONVEX M(inventoryItems:create)] … Asset ID already exists.`
    // too, so an unscoped `getByText` is a strict-mode violation. Asserting the
    // bar is the stronger claim anyway — the operator has to see it in the form.
    await expect(formSaveBar(page).getByText("Asset ID already exists.")).toBeVisible({
      timeout: 30_000,
    });
  });

  test("containment makes the contained asset inherit the container's location", async ({
    page,
  }) => {
    const child = await waitForStorageLocation(childLocation, (state) => Boolean(state?.path));
    const content = await waitForInventoryItem(contentAssetId, (state) => Boolean(state?.itemId));

    await page.goto("/dashboard/inventory/items");
    await expect(page.getByRole("heading", { name: "Inventory Items" })).toBeVisible({
      timeout: 30_000,
    });
    await searchItems(page, contentAssetId);

    const row = await revealRow(page, itemRow(page, content.itemId));
    await row.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByText("Edit Item")).toBeVisible({ timeout: 20_000 });

    await pickSearchableOption(
      page,
      page.getByTestId("item-container-field").getByTestId("searchable-select-trigger"),
      caseAssetId,
      new RegExp(`^${caseAssetId}`),
    );
    await formSaveBar(page).getByRole("button", { name: "Save", exact: true }).click();

    const contained = await waitForInventoryItem(
      contentAssetId,
      (state) => state?.containedInAssetId === caseAssetId,
    );
    // Never set on this form: the location came from the container.
    expect(contained.storageLocationPath).toBe(child.path);

    const container = await waitForInventoryItem(caseAssetId, (state) => state?.contains.length === 1);
    expect(container.contains).toEqual([
      { assetId: contentAssetId, storageLocationPath: child.path },
    ]);
  });

  test("a container cannot be deleted while it still holds an asset", async ({ page }) => {
    const seededCase = await waitForInventoryItem(caseAssetId, (state) => state?.contains.length === 1);

    await page.goto("/dashboard/inventory/items");
    await expect(page.getByRole("heading", { name: "Inventory Items" })).toBeVisible({
      timeout: 30_000,
    });
    await searchItems(page, caseAssetId);

    const row = await revealRow(page, itemRow(page, seededCase.itemId));
    await row.getByRole("button", { name: "Delete", exact: true }).click();

    // `inventoryItems.remove` refuses rather than orphaning the contents.
    await page.waitForTimeout(3_000);
    await expect(itemRow(page, seededCase.itemId)).toBeVisible();
    expect(
      (runConvex("e2eHelpers:getInventoryItemByAssetId", { assetId: caseAssetId }) as {
        itemId: string;
      } | null)?.itemId,
    ).toBe(seededCase.itemId);
  });

  test("a storage location in use cannot be deleted", async ({ page }) => {
    const child = await waitForStorageLocation(childLocation, (state) => Boolean(state?.path));
    expect(child.linkedItemCount).toBeGreaterThan(0);

    await page.goto("/dashboard/inventory/storage-locations");
    await expect(page.getByRole("heading", { name: "Storage Locations" })).toBeVisible({
      timeout: 30_000,
    });

    const childRow = page.getByTestId(`location-row-${child.locationId}`);
    await expect(childRow).toBeVisible({ timeout: 30_000 });
    await childRow.getByRole("button", { name: "Delete", exact: true }).click();
    await page.waitForTimeout(3_000);
    await expect(page.getByTestId(`location-row-${child.locationId}`)).toBeVisible();

    // The parent is refused for a different reason: it still has a child.
    const parent = await waitForStorageLocation(parentLocation, (state) => Boolean(state?.path));
    expect(parent.childPaths).toEqual([child.path]);
    const parentRow = page.getByTestId(`location-row-${parent.locationId}`);
    await parentRow.getByRole("button", { name: "Delete", exact: true }).click();
    await page.waitForTimeout(3_000);
    await expect(page.getByTestId(`location-row-${parent.locationId}`)).toBeVisible();
  });
});

/** The items manager's search box (a bare `Input`, not a `FilterField`). */
async function searchItems(page: Page, query: string) {
  await page.getByPlaceholder("Search by asset ID, serial, model").fill(query);
}

/**
 * Fill and submit the Create Item form.
 *
 * `submitOnly` skips the assertions that a create landed, for the duplicate
 * case where it must not.
 */
async function createItem(
  page: Page,
  options: {
    assetId: string;
    serialNumber?: string;
    locationPath?: string;
    submitOnly?: boolean;
  },
) {
  const form = page.locator("form");
  await formField(form, "Asset ID").fill(options.assetId);
  if (options.serialNumber) {
    await formField(form, "Serial Number").fill(options.serialNumber);
  }
  await pickSearchableOption(
    page,
    page.getByTestId("item-type-field").getByTestId("searchable-select-trigger"),
    typeName,
    new RegExp(`^${typeName} - `),
  );
  if (options.locationPath) {
    await pickSearchableOption(
      page,
      page.getByTestId("item-location-field").getByTestId("searchable-select-trigger"),
      options.locationPath,
      options.locationPath,
    );
  }
  await form.getByRole("button", { name: "Create", exact: true }).click();
  if (!options.submitOnly) {
    await expect(formField(form, "Asset ID")).toHaveValue("", { timeout: 30_000 });
  }
}
