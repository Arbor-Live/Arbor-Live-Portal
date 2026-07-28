import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { checkboxByLabel, formField, formTextarea } from "../helpers/form";
import { pickSearchableOption } from "../helpers/select";
import {
  deleteInventoryFixtures,
  saveTypeForm,
  searchTypes,
  typeRow,
  waitForInventoryType,
  waitForPublicListing,
} from "../helpers/inventory";

const stamp = Date.now();
const typeName = `E2E Public Type ${stamp}`;
const publicSlug = `e2e-public-type-${String(stamp).slice(-8)}`;

/**
 * The publish switch on a model type, and what the public catalog then exposes.
 *
 * Three separate flags decide this and they are not interchangeable:
 * `publicListing` puts the type on the unauthenticated browse pages,
 * `publicProfile` additionally unlocks manuals, tips and images, and the
 * category's `publicBucket` picks which `/types/{bucket}` page it lands on. The
 * split matters because a listing-only type must *not* leak its manuals — so
 * this asserts the shape of what is published, not just that something was.
 *
 * The assertions run against `publicInventory.listPublicTypes` rather than the
 * rendered page on purpose. `/types` and `/types/[bucket]` are statically
 * generated with `revalidate = 3600` and only refresh early through an
 * on-demand `/api/revalidate` call that needs `REVALIDATE_SECRET`, which the
 * e2e stack does not set. Asserting the page would test the ISR cache, not the
 * publish switch; the pages get their own render smoke below.
 */
test.describe.serial("inventory type public visibility", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => {
    // "sound" carries `publicBucket: "sound"`, so the bucket assertion below is
    // about the mapping rather than about the inferred-from-key fallback.
    runConvex("e2eHelpers:ensureInventoryCategory", {
      key: "sound",
      label: "Sound",
      publicBucket: "sound",
    });
  });

  test.afterAll(() => {
    deleteInventoryFixtures({ typeNames: [typeName] });
  });

  test("a listing-only type is published without its profile fields", async ({ page }) => {
    await page.goto("/dashboard/inventory/types");
    await expect(page.getByText("Model Types")).toBeVisible({ timeout: 30_000 });

    const form = page.locator("form");
    await formField(form, "Name").fill(typeName);
    await formField(form, "Model").fill("E2E-PUB-1");
    await formTextarea(form, "Description").fill("Public description for the Batch 10 suite.");
    await formTextarea(form, "Tips").fill("Profile-only tips that must stay private.");
    await pickSearchableOption(
      page,
      page.getByTestId("type-category-field").getByTestId("searchable-select-trigger"),
      "Sound",
      /^Sound$/,
    );
    await formField(form, "Optional public slug (for direct links)").fill(publicSlug);
    await checkboxByLabel(form, "List publicly").check();

    await saveTypeForm(page, "create");

    const created = await waitForInventoryType(typeName, (state) => Boolean(state?.typeId));
    expect(created.publicListing).toBe(true);
    expect(created.publicProfile).toBe(false);
    expect(created.publicSlug).toBe(publicSlug);

    const listing = await waitForPublicListing(
      { typeName },
      (state) => Boolean(state?.type),
    );
    expect(listing.type?.bucket).toBe("sound");
    expect(listing.type?.publicProfileEnabled).toBe(false);
    // Description is public at listing level; tips and the slug are not.
    expect(listing.type?.description).toBe("Public description for the Batch 10 suite.");
    expect(listing.type?.tips).toBeNull();
    expect(listing.type?.publicSlug).toBeNull();
  });

  test("enabling the full profile unlocks tips and the slug", async ({ page }) => {
    const created = await waitForInventoryType(typeName, (state) => Boolean(state?.typeId));

    await page.goto("/dashboard/inventory/types");
    await expect(page.getByText("Model Types")).toBeVisible({ timeout: 30_000 });
    await searchTypes(page, typeName);

    const row = typeRow(page, created.typeId);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText("Public listing");
    await row.getByRole("button", { name: "Edit", exact: true }).click();

    const form = page.locator("form");
    await expect(page.getByText("Edit Type")).toBeVisible({ timeout: 20_000 });
    await checkboxByLabel(form, "Share full public profile").check();
    await saveTypeForm(page, "edit");

    await waitForInventoryType(typeName, (state) => state?.publicProfile === true);
    const listing = await waitForPublicListing(
      { typeName },
      (state) => state?.type?.publicProfileEnabled === true,
    );
    expect(listing.type?.tips).toBe("Profile-only tips that must stay private.");
    expect(listing.type?.publicSlug).toBe(publicSlug);
  });

  test("the bulk Hide from public action unpublishes the row", async ({ page }) => {
    const created = await waitForInventoryType(typeName, (state) => Boolean(state?.typeId));

    await page.goto("/dashboard/inventory/types");
    await expect(page.getByText("Model Types")).toBeVisible({ timeout: 30_000 });
    await searchTypes(page, typeName);

    const row = typeRow(page, created.typeId);
    await expect(row).toBeVisible({ timeout: 30_000 });
    await expect(row).toContainText("Public + profile");
    // The row checkbox is what the bulk bar acts on; scoping to the seeded row
    // matters because the shared deployment is full of other `E2E ` types.
    await row.locator("input[type='checkbox']").check();

    await page.getByRole("button", { name: "Hide from public" }).click();

    // The button clears both flags in one mutation, which is the point: a type
    // must not be able to keep a full public profile while unlisted.
    const hidden = await waitForInventoryType(typeName, (state) => state?.publicListing === false);
    expect(hidden.publicProfile).toBe(false);
    await expect(typeRow(page, created.typeId)).toContainText("Hidden", { timeout: 30_000 });

    const listing = await waitForPublicListing({ typeName }, (state) => state?.type === null);
    expect(listing.type).toBeNull();
  });
});

/**
 * A render smoke, deliberately not a content assertion — see the comment above
 * on why a type published seconds ago is not on these statically generated
 * pages yet.
 */
test.describe("public model type pages", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of ["/types", "/types/sound", "/types/lighting"]) {
    test(`${path} renders for signed-out visitors`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.getByText(/model types/i).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    });
  }

  test("an unknown bucket redirects to the index", async ({ page }) => {
    await page.goto("/types/not-a-bucket");
    await expect(page).toHaveURL(/\/types$/, { timeout: 30_000 });
  });
});
