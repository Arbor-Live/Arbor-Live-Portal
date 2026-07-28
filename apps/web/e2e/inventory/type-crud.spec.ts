import { test, expect, type Page } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { formField, formTextarea } from "../helpers/form";
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
const typeName = `E2E Type ${stamp}`;
const renamedTypeName = `E2E Type Renamed ${stamp}`;
const guardedTypeName = `E2E Type Guarded ${stamp}`;
const guardedAssetId = `E2E-TYPE-${String(stamp).slice(-6)}`;

/**
 * Model types on `/dashboard/inventory/types`.
 *
 * This is the widest-blast-radius table in the app: every event pull list,
 * package line and invoice equipment line resolves through an `inventoryTypes`
 * row, and every other e2e batch seeds one. Until Batch 10 nothing drove the
 * editor that creates them.
 *
 * Prices are the reason this asserts more than "the row exists".
 * `inventoryTypes.create` derives what the form leaves blank — a bare MSRP
 * back-fills subsidized at 5% and normal at 10% — and it writes the legacy
 * `rentalPriceUsd` mirror that pull lists and older invoices still read. A spec
 * that only checked the field it typed would miss both.
 */
test.describe.serial("inventory type CRUD", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => {
    // `inventoryTypes.create` refuses a category that is missing or inactive,
    // and a fresh anonymous CI deployment has none of the defaults.
    runConvex("e2eHelpers:ensureInventoryCategory", {
      key: "misc",
      label: "Misc",
      publicBucket: "misc",
    });
    runConvex("e2eHelpers:ensureInventoryCategory", {
      key: "lighting",
      label: "Lighting",
      publicBucket: "lighting",
    });
  });

  test.afterAll(() => {
    deleteInventoryFixtures({
      assetIds: [guardedAssetId],
      typeNames: [typeName, renamedTypeName, guardedTypeName],
    });
  });

  test("admin creates a type and the server fills in the derived rates", async ({ page }) => {
    await page.goto("/dashboard/inventory/types");
    await expect(page.getByText("Model Types")).toBeVisible({ timeout: 30_000 });

    const form = page.locator("form");
    await formField(form, "Name").fill(typeName);
    await formField(form, "Model").fill("E2E-MODEL-1");
    await formField(form, "Manufacturer").fill("E2E Optics");
    await formTextarea(form, "Description").fill("Created by the Batch 10 e2e suite.");
    // MSRP only: the other two rates are the server's to derive.
    await formField(form, "MSRP (USD)").fill("2000");
    await pickSearchableOption(page, categoryTrigger(page), "Misc", /^Misc$/);

    await saveTypeForm(page, "create");

    const created = await waitForInventoryType(typeName, (state) => Boolean(state?.typeId));
    expect(created.model).toBe("E2E-MODEL-1");
    expect(created.manufacturer).toBe("E2E Optics");
    expect(created.category).toBe("misc");
    expect(created.msrpUsd).toBe(2000);
    // 5% / 10% of MSRP, plus the legacy mirror the pull list still reads.
    expect(created.subsidizedRentalPriceUsd).toBe(100);
    expect(created.nonSubsidizedRentalPriceUsd).toBe(200);
    expect(created.rentalPriceUsd).toBe(200);
    expect(created.publicListing).toBe(false);

    // A successful create resets the form, which is how the operator knows the
    // next thing they type is a new type rather than an edit of this one.
    await expect(formField(form, "Name")).toHaveValue("", { timeout: 20_000 });
  });

  test("admin edits the type through the save bar", async ({ page }) => {
    const created = await waitForInventoryType(typeName, (state) => Boolean(state?.typeId));

    await page.goto("/dashboard/inventory/types");
    await expect(page.getByText("Model Types")).toBeVisible({ timeout: 30_000 });
    await searchTypes(page, typeName);

    // Asserted directly rather than paged to. A filtered `inventoryTypes.list`
    // scans a bounded window and returns one complete page, so a type created a
    // moment ago has to be on screen as soon as the search settles — if this
    // ever needs a Load more, the filter has regressed to running against the
    // page rather than the table.
    const row = typeRow(page, created.typeId);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("button", { name: "Edit", exact: true }).click();

    const form = page.locator("form");
    await expect(page.getByText("Edit Type")).toBeVisible({ timeout: 20_000 });
    await expect(formField(form, "Name")).toHaveValue(typeName, { timeout: 20_000 });

    await formField(form, "Name").fill(renamedTypeName);
    // An explicit rate must win over the MSRP-derived one.
    await formField(form, "Normal (10%) USD").fill("275");
    await pickSearchableOption(page, categoryTrigger(page), "Lighting", /^Lighting$/);

    await saveTypeForm(page, "edit");

    const edited = await waitForInventoryType(
      renamedTypeName,
      (state) => state?.nonSubsidizedRentalPriceUsd === 275,
    );
    expect(edited.typeId).toBe(created.typeId);
    expect(edited.category).toBe("lighting");
    expect(edited.rentalPriceUsd).toBe(275);
    // MSRP is untouched, so the subsidized rate stays where the 5% rule put it.
    expect(edited.subsidizedRentalPriceUsd).toBe(100);
    expect(getInventoryType(typeName)).toBeNull();
  });

  test("delete is refused while an inventory item still points at the type", async ({ page }) => {
    runConvex("e2eHelpers:seedInventoryType", { name: guardedTypeName, category: "misc" });
    runConvex("e2eHelpers:seedInventoryItem", {
      assetId: guardedAssetId,
      typeName: guardedTypeName,
    });
    const guarded = await waitForInventoryType(
      guardedTypeName,
      (state) => state?.linkedItemCount === 1,
    );

    await page.goto("/dashboard/inventory/types");
    await expect(page.getByText("Model Types")).toBeVisible({ timeout: 30_000 });
    await searchTypes(page, guardedTypeName);

    const row = typeRow(page, guarded.typeId);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("button", { name: "Delete", exact: true }).click();

    // `inventoryTypes.remove` throws rather than orphaning the item, so the row
    // has to survive. Convex pushes list updates over the socket, so a broken
    // guard would show up here as the row vanishing.
    await page.waitForTimeout(3_000);
    expect(getInventoryType(guardedTypeName)?.typeId).toBe(guarded.typeId);
    await expect(typeRow(page, guarded.typeId)).toBeVisible();
  });

  test("delete removes an unreferenced type", async ({ page }) => {
    const edited = await waitForInventoryType(renamedTypeName, (state) => Boolean(state?.typeId));
    expect(edited.linkedItemCount).toBe(0);
    expect(edited.packageLineCount).toBe(0);

    await page.goto("/dashboard/inventory/types");
    await expect(page.getByText("Model Types")).toBeVisible({ timeout: 30_000 });
    await searchTypes(page, renamedTypeName);

    const row = typeRow(page, edited.typeId);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await row.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(typeRow(page, edited.typeId)).toHaveCount(0, { timeout: 30_000 });
    expect(getInventoryType(renamedTypeName)).toBeNull();
  });
});

function categoryTrigger(page: Page) {
  return page.getByTestId("type-category-field").getByTestId("searchable-select-trigger");
}
