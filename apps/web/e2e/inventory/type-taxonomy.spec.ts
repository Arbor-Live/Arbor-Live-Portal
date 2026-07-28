import { test, expect } from "@playwright/test";
import { formField } from "../helpers/form";
import { pickSearchableOption } from "../helpers/select";
import {
  deleteInventoryFixtures,
  getInventoryType,
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
    await page.goto("/dashboard/inventory/types");
    await expect(page.getByText("Manage Categories")).toBeVisible({ timeout: 30_000 });

    // `ensureDefaults` is idempotent and back-fills the `publicBucket` of any
    // default category that drifted, so a run on a fresh deployment starts from
    // the same taxonomy as the shared one.
    await page.getByRole("button", { name: "Seed Default Categories" }).click();
    await expect(page.getByTestId("category-row-lighting")).toBeVisible({ timeout: 30_000 });

    const categoriesCard = page
      .locator("[data-slot='card']")
      .filter({ hasText: "Manage Categories" });
    await categoriesCard.getByPlaceholder("key (e.g. backline)").fill(categoryKey);
    await categoriesCard.getByPlaceholder("Label").fill(categoryLabel);
    await categoriesCard.locator("select").first().selectOption("environmental");
    await categoriesCard.getByRole("button", { name: "Add Category", exact: true }).click();

    const categoryRow = page.getByTestId(`category-row-${categoryKey}`);
    await expect(categoryRow).toBeVisible({ timeout: 30_000 });
    await expect(categoryRow).toContainText(categoryLabel);
    await expect(categoryRow.locator("select")).toHaveValue("environmental");

    const capabilitiesCard = page
      .locator("[data-slot='card']")
      .filter({ hasText: "Add Capability Key" });
    await capabilitiesCard.getByPlaceholder("key (e.g. wireless)").fill(capabilityKey);
    await capabilitiesCard.getByPlaceholder("Label").fill(capabilityLabel);
    await capabilitiesCard.getByRole("button", { name: "Add Capability" }).click();

    await expect(page.getByTestId(`capability-row-${capabilityKey}`)).toBeVisible({
      timeout: 30_000,
    });
  });

  test("the new category and capability are usable on a type", async ({ page }) => {
    await page.goto("/dashboard/inventory/types");
    await expect(page.getByText("Model Types")).toBeVisible({ timeout: 30_000 });

    const form = page.locator("form");
    await formField(form, "Name").fill(typeName);
    await formField(form, "Model").fill("E2E-TAX-1");
    await pickSearchableOption(
      page,
      page.getByTestId("type-category-field").getByTestId("searchable-select-trigger"),
      categoryLabel,
      categoryLabel,
    );

    await page.getByTestId("type-capability-picker").click();
    await page.getByPlaceholder("Search capabilities...").fill(capabilityLabel);
    await page.locator("label").filter({ hasText: capabilityLabel }).locator("input").check();
    await page.getByTestId("type-capability-picker").click();

    await saveTypeForm(page, "create");

    const created = await waitForInventoryType(typeName, (state) => Boolean(state?.typeId));
    expect(created.category).toBe(categoryKey);
    expect(created.capabilities).toEqual([capabilityKey]);
  });

  test("the capability filter narrows the types list to that type", async ({ page }) => {
    const created = await waitForInventoryType(typeName, (state) => Boolean(state?.typeId));

    await page.goto("/dashboard/inventory/types");
    await expect(page.getByText("Model Types")).toBeVisible({ timeout: 30_000 });

    // Two filters at once, both server-side arguments to `inventoryTypes.list`.
    await searchTypes(page, typeName);
    await pickSearchableOption(
      page,
      page
        .locator("div.space-y-1")
        .filter({ has: page.getByText("Capability", { exact: true }) })
        .getByTestId("searchable-select-trigger"),
      capabilityLabel,
      capabilityLabel,
    );

    await expect(typeRow(page, created.typeId)).toBeVisible({ timeout: 30_000 });
    // The filter counter is the page's own statement that a filter is applied.
    await expect(page.getByRole("button", { name: /^Clear filters \(2\)$/ })).toBeVisible({
      timeout: 20_000,
    });
  });

  test("a category in use cannot be deleted", async ({ page }) => {
    await page.goto("/dashboard/inventory/types");
    const categoryRow = page.getByTestId(`category-row-${categoryKey}`);
    await expect(categoryRow).toBeVisible({ timeout: 30_000 });

    await categoryRow.getByRole("button", { name: "Delete", exact: true }).click();

    // `inventoryCategories.remove` refuses while any type still names the key —
    // deleting it would leave those types un-editable, because `update`
    // re-validates the category on every save.
    await page.waitForTimeout(3_000);
    await expect(page.getByTestId(`category-row-${categoryKey}`)).toBeVisible();
    expect(getInventoryType(typeName)?.category).toBe(categoryKey);
  });

  test("the category frees up once its last type is gone", async ({ page }) => {
    const created = await waitForInventoryType(typeName, (state) => Boolean(state?.typeId));

    await page.goto("/dashboard/inventory/types");
    await expect(page.getByText("Model Types")).toBeVisible({ timeout: 30_000 });
    await searchTypes(page, typeName);
    const row = typeRow(page, created.typeId);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(typeRow(page, created.typeId)).toHaveCount(0, { timeout: 30_000 });

    const categoryRow = page.getByTestId(`category-row-${categoryKey}`);
    await categoryRow.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByTestId(`category-row-${categoryKey}`)).toHaveCount(0, {
      timeout: 30_000,
    });

    // Capabilities have no such guard — `capabilityDefinitions.remove` deletes
    // unconditionally — so this one only has to disappear.
    const capabilityRow = page.getByTestId(`capability-row-${capabilityKey}`);
    await capabilityRow.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByTestId(`capability-row-${capabilityKey}`)).toHaveCount(0, {
      timeout: 30_000,
    });
  });
});
