import { test, expect, type Page } from "@playwright/test";
import { acceptAppDialog, dismissAppDialog } from "../helpers/auth";
import { runConvex } from "../helpers/convex";
import { formField } from "../helpers/form";
import { deleteInventoryFixtures, waitForInventoryPackage } from "../helpers/inventory";

const stamp = Date.now();
const packageName = `E2E Package ${stamp}`;
const firstTypeName = `E2E Pkg Type A ${stamp}`;
const secondTypeName = `E2E Pkg Type B ${stamp}`;

type SeededType = { typeId: string; name: string; model: string };

let firstType: SeededType;
let secondType: SeededType;

/**
 * Packages on `/dashboard/inventory/packages`.
 *
 * A package is unnamed content units (1 option = included; 2+ = exclusive).
 * Catalog adds bump unit qty when the same single-item unit already exists.
 * `inventoryPackages.update` replaces option groups + BOM lines on save, so the
 * edit path is still the interesting one: qty change and removal share a write.
 *
 * The editor is a hand-rolled modal; contents live in draft state mirrored into
 * the form on save — "add from the catalog" and "the form is dirty" are both
 * required for the save to carry the lines.
 */
test.describe.serial("inventory package CRUD", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => {
    runConvex("e2eHelpers:ensureInventoryCategory", {
      key: "sound",
      label: "Sound",
      publicBucket: "sound",
    });
    firstType = runConvex("e2eHelpers:seedInventoryType", {
      name: firstTypeName,
      category: "sound",
      subsidizedRentalPriceUsd: 10,
      nonSubsidizedRentalPriceUsd: 20,
    }) as SeededType;
    secondType = runConvex("e2eHelpers:seedInventoryType", {
      name: secondTypeName,
      category: "sound",
      subsidizedRentalPriceUsd: 5,
      nonSubsidizedRentalPriceUsd: 10,
    }) as SeededType;
  });

  test.afterAll(() => {
    deleteInventoryFixtures({
      packageNames: [packageName],
      typeNames: [firstTypeName, secondTypeName],
    });
  });

  test("admin builds a package from the catalog panel", async ({ page }) => {
    await page.goto("/dashboard/inventory/packages");
    await expect(page.getByText("Packages", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Create Package" }).click();
    await expect(page.getByRole("heading", { name: "Create Package" })).toBeVisible({
      timeout: 20_000,
    });

    const editor = page.locator("#package-editor-form");
    await formField(editor, "Name").fill(packageName);

    await addCatalogType(page, firstType.typeId);
    await addCatalogType(page, firstType.typeId);
    await addCatalogType(page, secondType.typeId);

    // 2 × $20 + 1 × $10 non-subsidized, 2 × $10 + 1 × $5 subsidized. The
    // suggestion is computed in the browser from the type rates; the point of
    // clicking it is that what the server stores agrees with what was shown.
    await expect(page.getByText(/2 units · 2 included types · 3 total/)).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Use suggested prices" }).click();
    await expect(formField(editor, "Non-Subsidized Package Price (USD)")).toHaveValue("50");
    await expect(formField(editor, /^Subsidized Package Price/)).toHaveValue("25");

    await page.getByRole("button", { name: "Create", exact: true }).click();

    const created = await waitForInventoryPackage(packageName, (state) => Boolean(state?.packageId));
    expect(created.active).toBe(true);
    expect(created.nonSubsidizedPackagePriceUsd).toBe(50);
    expect(created.subsidizedPackagePriceUsd).toBe(25);
    // `packagePriceCents` is the legacy field older readers still use; it has to
    // track the non-subsidized price rather than drift from it.
    expect(created.packagePriceCents).toBe(5000);
    expect(created.items).toEqual([
      { typeId: firstType.typeId, typeName: firstTypeName, quantity: 2 },
      { typeId: secondType.typeId, typeName: secondTypeName, quantity: 1 },
    ]);

    // A successful save closes the editor, which is the only signal the
    // operator gets that the package landed.
    await expect(page.locator("#package-editor-form")).toHaveCount(0, { timeout: 20_000 });
  });

  test("editing re-writes the line rows rather than patching them", async ({ page }) => {
    const created = await waitForInventoryPackage(packageName, (state) => Boolean(state?.packageId));

    await page.goto("/dashboard/inventory/packages");
    const card = page.getByTestId(`package-card-${created.packageId}`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card).toContainText("2 included types");
    await card.getByRole("button", { name: "Edit", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Edit Package" })).toBeVisible({
      timeout: 20_000,
    });

    const firstUnit = page.getByTestId("package-content-unit").filter({
      has: page.getByTestId(`package-content-row-${firstType.typeId}`),
    });
    await expect(firstUnit).toBeVisible({ timeout: 20_000 });
    await firstUnit.getByRole("button", { name: "Increase Unit quantity" }).click();

    const secondUnit = page.getByTestId("package-content-unit").filter({
      has: page.getByTestId(`package-content-row-${secondType.typeId}`),
    });
    await secondUnit.getByRole("button", { name: "Remove unit" }).click();
    await expect(secondUnit).toHaveCount(0, { timeout: 20_000 });

    await page.getByRole("button", { name: "Update", exact: true }).click();

    const updated = await waitForInventoryPackage(
      packageName,
      (state) => state?.items.length === 1,
    );
    expect(updated.items).toEqual([
      { typeId: firstType.typeId, typeName: firstTypeName, quantity: 3 },
    ]);
    // The removed type must be free to delete again — a stale line row would
    // keep `inventoryTypes.remove` refusing forever.
    expect(updated.packageId).toBe(created.packageId);
  });

  test("closing a dirty editor asks before discarding", async ({ page }) => {
    const created = await waitForInventoryPackage(packageName, (state) => Boolean(state?.packageId));

    await page.goto("/dashboard/inventory/packages");
    const card = page.getByTestId(`package-card-${created.packageId}`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Edit Package" })).toBeVisible({
      timeout: 20_000,
    });

    await formField(page.locator("#package-editor-form"), "Name").fill(`${packageName} (dirty)`);

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    const dialog = page.getByTestId("app-dialog");
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    await expect(dialog).toContainText("Discard unsaved changes?");
    await dismissAppDialog(page);
    await expect(page.locator("#package-editor-form")).toBeVisible();

    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await acceptAppDialog(page);
    await expect(page.locator("#package-editor-form")).toHaveCount(0, { timeout: 20_000 });

    // Declining to save must leave the stored name alone.
    const unchanged = await waitForInventoryPackage(packageName, (state) => Boolean(state));
    expect(unchanged.name).toBe(packageName);
  });

  test("deleting the package releases its types", async ({ page }) => {
    const created = await waitForInventoryPackage(packageName, (state) => Boolean(state?.packageId));

    await page.goto("/dashboard/inventory/packages");
    const card = page.getByTestId(`package-card-${created.packageId}`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByTestId(`package-card-${created.packageId}`)).toHaveCount(0, {
      timeout: 30_000,
    });
    expect(runConvex("e2eHelpers:getInventoryPackageByName", { name: packageName })).toBeNull();

    // `inventoryPackages.remove` deletes the line rows too, which is what frees
    // the type: `inventoryTypes.remove` refuses while any package line exists.
    const releasedType = runConvex("e2eHelpers:getInventoryTypeByName", {
      name: firstTypeName,
    }) as { packageLineCount: number } | null;
    expect(releasedType?.packageLineCount).toBe(0);
  });
});

/**
 * Add one unit of a type from the editor's "Add equipment" panel.
 *
 * The panel is a tab inside the modal, and `addType` flips back to the contents
 * tab on the first add — so re-opening it is part of the interaction, not a
 * workaround.
 */
async function addCatalogType(page: Page, typeId: string) {
  await page.getByRole("button", { name: "Add equipment" }).click();
  const row = page.getByTestId(`package-catalog-row-${typeId}`);
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: /^Add (to package|another)$/ }).click();
}
