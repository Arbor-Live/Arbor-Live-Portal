import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { checkboxByLabel, formField } from "../helpers/form";
import {
  deleteInventoryFixtures,
  waitForInventoryPackage,
  waitForPublicListing,
} from "../helpers/inventory";

const stamp = Date.now();
const packageName = `E2E Public Package ${stamp}`;
const typeName = `E2E Public Pkg Type ${stamp}`;
const publicSlug = `e2e-public-pkg-${String(stamp).slice(-8)}`;

type SeededType = { typeId: string; name: string };

let seededType: SeededType;

/**
 * Publishing a package, and the two refusals guarding it.
 *
 * `inventoryPackages.create` will not accept `publicListing` without a
 * `publicBucket` — an unbucketed public package would have no page to appear
 * on — and it will not accept a slug already claimed by an inventory type,
 * because both live in the same public URL namespace. Both are server-side
 * throws surfaced through the editor's inline save status, not `window.alert`.
 */
test.describe.serial("inventory package public listing", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => {
    runConvex("e2eHelpers:ensureInventoryCategory", {
      key: "lighting",
      label: "Lighting",
      publicBucket: "lighting",
    });
    seededType = runConvex("e2eHelpers:seedInventoryType", {
      name: typeName,
      category: "lighting",
      subsidizedRentalPriceUsd: 15,
      nonSubsidizedRentalPriceUsd: 30,
    }) as SeededType;
  });

  test.afterAll(() => {
    deleteInventoryFixtures({ packageNames: [packageName], typeNames: [typeName] });
  });

  test("listing publicly requires a browse section", async ({ page }) => {
    await page.goto("/dashboard/inventory/packages");
    await expect(page.getByText("Packages", { exact: true }).first()).toBeVisible({
      timeout: 30_000,
    });

    await page.getByRole("button", { name: "Create Package" }).click();
    const editor = page.locator("#package-editor-form");
    await expect(editor).toBeVisible({ timeout: 20_000 });

    await formField(editor, "Name").fill(packageName);
    await formField(editor, "Non-Subsidized Package Price (USD)").fill("120");
    await formField(editor, /^Subsidized Package Price/).fill("60");
    await formField(editor, "Optional public slug").fill(publicSlug);

    await page.getByRole("button", { name: "Add equipment" }).click();
    const catalogRow = page.getByTestId(`package-catalog-row-${seededType.typeId}`);
    await expect(catalogRow).toBeVisible({ timeout: 20_000 });
    await catalogRow.getByRole("button", { name: /^Add (to package|another)$/ }).click();

    await checkboxByLabel(editor, "List publicly").check();
    // Ticking the box reveals the section picker, deliberately left unset.
    await expect(editor.getByText("Public browse section")).toBeVisible({ timeout: 20_000 });

    await page.getByRole("button", { name: "Create", exact: true }).click();

    // The zod refinement catches this before the mutation runs, so the editor
    // stays open with the work intact and says why. The section picker is a
    // plain `<select>` rather than a `FormField`, so this batch had to add the
    // error line — until then Create silently did nothing.
    await expect(
      page.getByText("Choose a public browse section when listing publicly"),
    ).toBeVisible({ timeout: 20_000 });
    expect(runConvex("e2eHelpers:getInventoryPackageByName", { name: packageName })).toBeNull();

    await editor.locator("select").selectOption("lighting");
    await page.getByRole("button", { name: "Create", exact: true }).click();

    const created = await waitForInventoryPackage(packageName, (state) => Boolean(state?.packageId));
    expect(created.publicListing).toBe(true);
    expect(created.publicBucket).toBe("lighting");
    expect(created.publicSlug).toBe(publicSlug);
  });

  test("the package shows up in the public catalog under its chosen bucket", async () => {
    const listing = await waitForPublicListing({ packageName }, (state) => Boolean(state?.package));
    expect(listing.package?.bucket).toBe("lighting");
    expect(listing.package?.publicSlug).toBe(publicSlug);
  });

  test("an inactive package drops out of the public catalog", async ({ page }) => {
    const created = await waitForInventoryPackage(packageName, (state) => Boolean(state?.packageId));

    await page.goto("/dashboard/inventory/packages");
    const card = page.getByTestId(`package-card-${created.packageId}`);
    await expect(card).toBeVisible({ timeout: 30_000 });
    await card.getByRole("button", { name: "Edit", exact: true }).click();

    const editor = page.locator("#package-editor-form");
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await checkboxByLabel(editor, "Active").uncheck();
    await page.getByRole("button", { name: "Update", exact: true }).click();

    // `publicListing` stays true — `listPublicPackages` filters on `active`
    // separately, so archiving a package hides it without losing the publish
    // settings an operator would have to re-enter.
    const archived = await waitForInventoryPackage(packageName, (state) => state?.active === false);
    expect(archived.publicListing).toBe(true);
    expect(archived.publicBucket).toBe("lighting");

    const listing = await waitForPublicListing({ packageName }, (state) => state?.package === null);
    expect(listing.package).toBeNull();
  });

  test("the public package pages render for signed-out visitors", async ({ page }) => {
    await page.context().clearCookies();
    for (const path of ["/packages", "/packages/lighting"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    }
  });
});
