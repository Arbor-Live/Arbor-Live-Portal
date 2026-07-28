import { expect, type Locator, type Page } from "@playwright/test";
import { pollConvex, runConvex } from "./convex";

export type InventoryTypeState = {
  typeId: string;
  name: string;
  model: string;
  manufacturer: string | null;
  category: string;
  description: string | null;
  tips: string | null;
  msrpUsd: number | null;
  subsidizedRentalPriceUsd: number | null;
  nonSubsidizedRentalPriceUsd: number | null;
  rentalPriceUsd: number | null;
  capabilities: string[];
  manualUrls: Array<{ title: string; url: string }>;
  gdtfUrls: Array<{ title: string; url: string }>;
  publicListing: boolean;
  publicProfile: boolean;
  publicSlug: string | null;
  linkedItemCount: number;
  packageLineCount: number;
};

export type InventoryPackageState = {
  packageId: string;
  name: string;
  description: string | null;
  active: boolean;
  packagePriceCents: number;
  subsidizedPackagePriceUsd: number | null;
  nonSubsidizedPackagePriceUsd: number | null;
  publicListing: boolean;
  publicBucket: string | null;
  publicSlug: string | null;
  items: Array<{ typeId: string; typeName: string; quantity: number }>;
};

export type InventoryItemState = {
  itemId: string;
  assetId: string;
  serialNumber: string | null;
  typeName: string | null;
  status: string | null;
  notes: string | null;
  storageLocationPath: string | null;
  containedInAssetId: string | null;
  contains: Array<{ assetId: string; storageLocationPath: string | null }>;
};

export type StorageLocationState = {
  locationId: string;
  name: string;
  path: string;
  parentPath: string | null;
  childPaths: string[];
  linkedItemCount: number;
};

export type PublicInventoryListing = {
  type: {
    bucket: string;
    name: string;
    publicProfileEnabled: boolean;
    capabilities: string[];
    description: string | null;
    tips: string | null;
    manualCount: number;
    publicSlug: string | null;
  } | null;
  package: {
    bucket: string;
    name: string;
    description: string | null;
    publicSlug: string | null;
  } | null;
};

export function getInventoryType(name: string) {
  return runConvex("e2eHelpers:getInventoryTypeByName", { name }) as InventoryTypeState | null;
}

export function waitForInventoryType(
  name: string,
  predicate: (state: InventoryTypeState | null) => boolean,
) {
  return pollConvex<InventoryTypeState>("e2eHelpers:getInventoryTypeByName", { name }, predicate);
}

export function waitForInventoryPackage(
  name: string,
  predicate: (state: InventoryPackageState | null) => boolean,
) {
  return pollConvex<InventoryPackageState>(
    "e2eHelpers:getInventoryPackageByName",
    { name },
    predicate,
  );
}

export function waitForInventoryItem(
  assetId: string,
  predicate: (state: InventoryItemState | null) => boolean,
) {
  return pollConvex<InventoryItemState>(
    "e2eHelpers:getInventoryItemByAssetId",
    { assetId },
    predicate,
  );
}

export function waitForStorageLocation(
  name: string,
  predicate: (state: StorageLocationState | null) => boolean,
) {
  return pollConvex<StorageLocationState>(
    "e2eHelpers:getStorageLocationByName",
    { name },
    predicate,
  );
}

export function waitForPublicListing(
  args: { typeName?: string; packageName?: string },
  predicate: (state: PublicInventoryListing | null) => boolean,
) {
  return pollConvex<PublicInventoryListing>(
    "e2eHelpers:getPublicInventoryListing",
    args,
    predicate,
  );
}

/**
 * Drop the catalog rows a spec created.
 *
 * Every catalog spec calls this from `afterAll`. `pruneE2eSeedData` only knows
 * about events, so without this the shared deployment gains a type/package/item
 * per run, and the reads behind these pages are capped
 * (`inventoryTypes.listOptions` takes 1500, `inventoryPackages.list` takes 500).
 */
export function deleteInventoryFixtures(args: {
  assetIds?: string[];
  packageNames?: string[];
  typeNames?: string[];
  locationNames?: string[];
  categoryKeys?: string[];
  capabilityKeys?: string[];
}) {
  return runConvex("e2eHelpers:deleteInventoryCatalogFixtures", args);
}

/** The types manager's search box (a `FilterField` labelled "Search"). */
export async function searchTypes(page: Page, query: string) {
  const search = page
    .locator("div.space-y-1")
    .filter({ has: page.getByText("Search", { exact: true }) })
    .locator("input")
    .first();
  await search.fill(query);
  return search;
}

/** The types table row for a seeded type id. */
export function typeRow(page: Page, typeId: string): Locator {
  return page.getByTestId(`type-row-${typeId}`);
}

/** The items table row for a seeded item id. */
export function itemRow(page: Page, itemId: string): Locator {
  return page.getByTestId(`item-row-${itemId}`);
}

/**
 * Wait for a row, paging the list if it is not on the first page.
 *
 * Unfiltered `inventoryItems.list` still paginates (100/page). Specs that
 * search first should already land the row on the finished filtered page;
 * this helper still covers the unfiltered path and slow first paints.
 *
 * Never `break` on a missing Load-more button: changing a filter puts the query
 * into `LoadingFirstPage`, where neither the rows nor the button exist, so an
 * early exit lands exactly in that gap.
 */
export async function revealRow(page: Page, row: Locator) {
  const loadMore = page.getByRole("button", { name: /^Load(ing)?/ }).first();
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await row.count()) return row;
    if (await loadMore.isVisible().catch(() => false)) {
      await loadMore.click().catch(() => undefined);
    }
    await page.waitForTimeout(500);
  }
  await expect(row).toBeVisible({ timeout: 30_000 });
  return row;
}

/**
 * Submit the type form.
 *
 * The two paths do not share a button. Creating has an in-form `type="submit"`
 * *and* a save bar whose label is also "Create", so an unscoped name matches
 * twice; editing renders no in-form submit at all and only goes through the
 * bar. Assert the result by polling Convex rather than by watching the bar:
 * `persistType` resets the form after a create but not after an edit, so the
 * edit path stays dirty — and its bar stays on screen — even on success.
 */
export async function saveTypeForm(page: Page, mode: "create" | "edit") {
  const button =
    mode === "create"
      ? page.locator("form").getByRole("button", { name: "Create", exact: true })
      : formSaveBar(page).getByRole("button", { name: "Save", exact: true });
  await expect(button).toBeVisible({ timeout: 20_000 });
  await button.scrollIntoViewIfNeeded();
  await button.click();
}

/** The `FormSaveBar` — `role="status"`, portalled into the page's bar stack. */
export function formSaveBar(page: Page): Locator {
  return page.getByRole("status").last();
}
