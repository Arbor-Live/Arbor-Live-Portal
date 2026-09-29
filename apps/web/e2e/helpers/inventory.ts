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

/** The types page's search box. */
export async function searchTypes(page: Page, query: string) {
  const search = page.getByRole("textbox", { name: "Search types" });
  await search.fill(query);
  return search;
}

/** Load the types page and wait for its list (or empty state) to render. */
export async function gotoTypes(page: Page, query?: string) {
  await page.goto(query ? `/dashboard/inventory/types?${query}` : "/dashboard/inventory/types");
  await expect(page.getByTestId("types-summary")).toBeVisible({ timeout: 30_000 });
}

/** The type editor side panel. */
export function typeSheet(page: Page): Locator {
  return page.getByTestId("type-sheet");
}

/** Open the empty panel through the header's New type button. */
export async function openNewType(page: Page) {
  await page.getByRole("button", { name: "New type", exact: true }).click();
  const sheet = typeSheet(page);
  await expect(sheet.getByText("New type", { exact: true })).toBeVisible({ timeout: 20_000 });
  return sheet;
}

/** Open a row's panel by clicking the row. */
export async function openTypeRow(page: Page, typeId: string) {
  const row = typeRow(page, typeId);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.getByTestId("type-row-open").click();
  const sheet = typeSheet(page);
  await expect(sheet.getByRole("button", { name: "Save changes" })).toBeVisible({ timeout: 20_000 });
  return sheet;
}

/** Delete a type from its row menu, accepting the confirm. */
export async function deleteTypeFromRow(page: Page, typeId: string) {
  await typeRow(page, typeId).getByRole("button", { name: /^More for / }).click();
  await page.getByRole("menuitem", { name: "Delete type" }).click();
  await confirmAppDialog(page, "Delete type");
}

/** Accept the shared app confirm dialog by its verb. */
export async function confirmAppDialog(page: Page, confirmLabel: string) {
  const dialog = page.getByTestId("app-dialog");
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
  await expect(dialog).toHaveCount(0, { timeout: 20_000 });
}

/** Open the Settings dialog (categories and capability keys) on one of its sections. */
export async function openTypeSettings(page: Page, section: "Categories" | "Capabilities") {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByTestId("type-settings-dialog");
  await expect(dialog).toBeVisible({ timeout: 20_000 });
  await dialog.getByRole("radio", { name: section }).click();
  return dialog;
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
 * Submit the type panel and wait for it to close.
 *
 * The panel closes only once the mutation succeeds, so a closed panel is the
 * page's own statement that the save went through; callers still poll Convex
 * for what was written.
 */
export async function saveTypeForm(page: Page, mode: "create" | "edit") {
  const sheet = typeSheet(page);
  const button = sheet.getByRole("button", {
    name: mode === "create" ? "Create type" : "Save changes",
    exact: true,
  });
  await expect(button).toBeEnabled({ timeout: 20_000 });
  await button.scrollIntoViewIfNeeded();
  await button.click();
  await expect(sheet).toHaveCount(0, { timeout: 30_000 });
}

/** The `FormSaveBar` — `role="status"`, portalled into the page's bar stack. */
export function formSaveBar(page: Page): Locator {
  return page.getByRole("status").last();
}
