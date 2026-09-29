import { test, expect } from "@playwright/test";
import { formField } from "../helpers/form";
import { pickSelectOption, pickSearchableOption } from "../helpers/select";
import {
  confirmAppDialog,
  deleteInventoryFixtures,
  deleteTypeFromRow,
  getInventoryType,
  gotoTypes,
  openNewType,
  openTypeSettings,
  saveTypeForm,
  searchTypes,
  typeRow,
  waitForInventoryType,
} from "../helpers/inventory";

const stamp = Date.now();
const suffix = String(stamp).slice(-8);
const categoryKey = `e2e_cat_${suffix}`;
const categoryLabel = `E2E Category ${suffix}`;
const capabilityKey = `e2ecap${suffix}`;
const capabilityLabel = `E2E Capability ${suffix}`;
const typeName = `E2E Taxonomy Type ${stamp}`;

/**
 * The taxonomy behind the types table: `inventoryCategories` and
 * `capabilityDefinitions`.
 *
 * These two tables are not decoration. `inventoryTypes.create` validates every
 * submitted category and capability against them and refuses anything missing
 * or inactive, and a category's `publicBucket` decides which public `/types`
 * bucket its types are grouped under. Both are also the only mutations in the
 * inventory area guarded by `requireAdmin` rather than `requireAuth`, which is
 * what the `/dashboard/inventory/types` route's `AdminOnlyGuard` exists for.
 *
 * Both are managed from the page's Settings dialog.
 */
test.describe.serial("inventory taxonomy", () => {
  test.setTimeout(180_000);

  test.afterAll(() => {
    deleteInventoryFixtures({
      typeNames: [typeName],
      categoryKeys: [categoryKey],
      capabilityKeys: [capabilityKey],
    });
  });

  test("admin adds a category and a capability key", async ({ page }) => {
    await gotoTypes(page);
    const dialog = await openTypeSettings(page, "Categories");

    // `ensureDefaults` is idempotent and back-fills the `publicBucket` of any
    // default category that drifted, so a run on a fresh deployment starts from
    // the same taxonomy as the shared one.
    await dialog.getByRole("button", { name: "Restore default categories" }).click();
    await expect(dialog.getByTestId("category-row-lighting")).toBeVisible({ timeout: 30_000 });

    const categoryForm = dialog.getByTestId("category-add-form");
    await categoryForm.getByLabel("Key").fill(categoryKey);
    await categoryForm.getByLabel("Label").fill(categoryLabel);
    await pickSelectOption(page, categoryForm.getByLabel("Public bucket"), "Environmental");
    await categoryForm.getByRole("button", { name: "Add category", exact: true }).click();

    const categoryRow = dialog.getByTestId(`category-row-${categoryKey}`);
    await expect(categoryRow).toBeVisible({ timeout: 30_000 });
    await expect(categoryRow).toContainText(categoryLabel);
    await expect(categoryRow.getByRole("combobox")).toHaveText("Environmental");

    await dialog.getByRole("radio", { name: "Capabilities" }).click();
    const capabilityForm = dialog.getByTestId("capability-add-form");
    await capabilityForm.getByLabel("Key").fill(capabilityKey);
    await capabilityForm.getByLabel("Label").fill(capabilityLabel);
    await capabilityForm.getByRole("button", { name: "Add capability", exact: true }).click();

    await expect(dialog.getByTestId(`capability-row-${capabilityKey}`)).toBeVisible({
      timeout: 30_000,
    });
  });

  test("the new category and capability are usable on a type", async ({ page }) => {
    await gotoTypes(page);

    const form = await openNewType(page);
    await formField(form, "Name").fill(typeName);
    await formField(form, "Model").fill("E2E-TAX-1");
    await pickSearchableOption(
      page,
      form.getByTestId("type-category-field").getByTestId("searchable-select-trigger"),
      categoryLabel,
      categoryLabel,
    );

    await form.getByTestId("type-capability-picker").click();
    await page.getByPlaceholder("Search capabilities...").fill(capabilityLabel);
    await page.getByRole("checkbox", { name: capabilityLabel }).check();
    await page.keyboard.press("Escape");
    await expect(page.getByPlaceholder("Search capabilities...")).toHaveCount(0);

    await saveTypeForm(page, "create");

    const created = await waitForInventoryType(typeName, (state) => Boolean(state?.typeId));
    expect(created.category).toBe(categoryKey);
    expect(created.capabilities).toEqual([capabilityKey]);
  });

  test("the capability filter narrows the types list to that type", async ({ page }) => {
    const created = await waitForInventoryType(typeName, (state) => Boolean(state?.typeId));

    await gotoTypes(page);

    // Two filters at once, both server-side arguments to `inventoryTypes.list`.
    await searchTypes(page, typeName);
    await pickSearchableOption(
      page,
      page.getByTestId("types-capability-filter").getByTestId("searchable-select-trigger"),
      capabilityLabel,
      capabilityLabel,
    );

    await expect(typeRow(page, created.typeId)).toBeVisible({ timeout: 30_000 });
    await expect(typeRow(page, created.typeId)).toContainText(capabilityLabel);
    // The filter counter is the page's own statement that a filter is applied.
    await expect(page.getByRole("button", { name: /^Clear filters \(2\)$/ })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("a category in use cannot be deleted", async ({ page }) => {
    await gotoTypes(page);
    const dialog = await openTypeSettings(page, "Categories");
    const categoryRow = dialog.getByTestId(`category-row-${categoryKey}`);
    await expect(categoryRow).toBeVisible({ timeout: 30_000 });

    await categoryRow.getByRole("button", { name: `Delete the ${categoryLabel} category` }).click();
    await confirmAppDialog(page, "Delete category");

    // `inventoryCategories.remove` refuses while any type still names the key —
    // deleting it would leave those types un-editable, because `update`
    // re-validates the category on every save.
    await page.waitForTimeout(3_000);
    await expect(dialog.getByTestId(`category-row-${categoryKey}`)).toBeVisible();
    expect(getInventoryType(typeName)?.category).toBe(categoryKey);
  });

  test("the category frees up once its last type is gone", async ({ page }) => {
    const created = await waitForInventoryType(typeName, (state) => Boolean(state?.typeId));

    await gotoTypes(page);
    await searchTypes(page, typeName);
    await expect(typeRow(page, created.typeId)).toBeVisible({ timeout: 30_000 });
    await deleteTypeFromRow(page, created.typeId);
    await expect(typeRow(page, created.typeId)).toHaveCount(0, { timeout: 30_000 });

    const dialog = await openTypeSettings(page, "Categories");
    await dialog
      .getByTestId(`category-row-${categoryKey}`)
      .getByRole("button", { name: `Delete the ${categoryLabel} category` })
      .click();
    await confirmAppDialog(page, "Delete category");
    await expect(dialog.getByTestId(`category-row-${categoryKey}`)).toHaveCount(0, {
      timeout: 30_000,
    });

    // Capabilities have no such guard — `capabilityDefinitions.remove` deletes
    // unconditionally — so this one only has to disappear.
    await dialog.getByRole("radio", { name: "Capabilities" }).click();
    await dialog
      .getByTestId(`capability-row-${capabilityKey}`)
      .getByRole("button", { name: `Delete the ${capabilityLabel} capability` })
      .click();
    await confirmAppDialog(page, "Delete capability");
    await expect(dialog.getByTestId(`capability-row-${capabilityKey}`)).toHaveCount(0, {
      timeout: 30_000,
    });
  });
});
