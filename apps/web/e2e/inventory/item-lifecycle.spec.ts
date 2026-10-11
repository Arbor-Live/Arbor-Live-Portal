import { test, expect } from "@playwright/test";
import { runConvex } from "../helpers/convex";
import { acceptAppDialog } from "../helpers/auth";
import { deleteInventoryFixtures, itemRow } from "../helpers/inventory";

const stamp = Date.now();
const suffix = String(stamp).slice(-6);
const typeName = `E2E Lifecycle Mixer ${stamp}`;
const lostTag = `E2E-LC-${suffix}-A`;
const relabelTag = `E2E-LC-${suffix}-B`;
const newTag = `E2E-LC-${suffix}-B2`;

let ids: { lost: string; relabel: string };

/**
 * Retiring takes a unit off the list (but not off the record) until it's
 * reinstated; replacing a tag keeps the old one scannable.
 */
test.describe.serial("item lifecycle", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => {
    runConvex("e2eHelpers:seedInventoryType", { name: typeName, category: "sound" });
    const seed = (assetId: string) =>
      (runConvex("e2eHelpers:seedInventoryItem", { assetId, typeName }) as { itemId: string }).itemId;
    ids = { lost: seed(lostTag), relabel: seed(relabelTag) };
  });

  test.afterAll(() => {
    deleteInventoryFixtures({ assetIds: [lostTag, relabelTag, newTag], typeNames: [typeName] });
  });

  test("a retired unit leaves the list and comes back when reinstated", async ({ page }) => {
    await page.goto(`/dashboard/inventory/items?item=${ids.lost}`);
    const sheet = page.getByTestId("item-sheet");
    await expect(sheet.getByText("In service")).toBeVisible({ timeout: 30_000 });

    await sheet.getByRole("button", { name: "Retire…" }).click();
    const dialog = page.getByTestId("retire-item-dialog");
    await dialog.getByTestId("retire-reason-lost").click();
    await dialog.getByLabel("Note (optional)").fill("Left at the venue");
    await dialog.getByRole("button", { name: "Retire as lost" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(sheet.getByText("Retired · Lost").first()).toBeVisible({ timeout: 15_000 });
    await expect(sheet.getByTestId("item-history")).toContainText("Left at the venue");

    // The list opens without retired units.
    await page.keyboard.press("Escape");
    await page.getByRole("textbox", { name: "Search items" }).fill(`E2E-LC-${suffix}`);
    await expect(itemRow(page, ids.relabel)).toBeVisible({ timeout: 30_000 });
    await expect(itemRow(page, ids.lost)).toHaveCount(0);

    await page.getByRole("button", { name: /^Show \d+ retired$/ }).click();
    await expect(itemRow(page, ids.lost)).toContainText("Retired · Lost", { timeout: 30_000 });

    await itemRow(page, ids.lost).click();
    await sheet.getByRole("button", { name: "Reinstate" }).click();
    await acceptAppDialog(page, "Reinstate");
    await expect(sheet.getByText("In service")).toBeVisible({ timeout: 15_000 });
  });

  test("a replaced tag still finds the unit when scanned", async ({ page }) => {
    await page.goto(`/dashboard/inventory/items?item=${ids.relabel}`);
    const sheet = page.getByTestId("item-sheet");
    await expect(sheet.getByText("In service")).toBeVisible({ timeout: 30_000 });

    await sheet.getByRole("button", { name: `More for ${relabelTag}` }).click();
    await page.getByRole("menuitem", { name: "Replace tag…" }).click();
    const dialog = page.getByTestId("retag-item-dialog");
    await dialog.getByLabel("New tag").fill(newTag);
    await dialog.getByRole("button", { name: "Replace tag" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(sheet.getByText(`Old tags, still scannable: ${relabelTag}`)).toBeVisible({ timeout: 15_000 });

    // Scan the old sticker: the panel opens on the relabeled unit. Close the
    // panel first; its own scan buttons ("Scan with camera", …) also match
    // "Scan", and the page's Scan button sits behind it.
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden({ timeout: 15_000 });
    await page.getByRole("button", { name: "Scan", exact: true }).click();
    const scan = page.locator("#asset-scan-input");
    await scan.fill(relabelTag);
    await scan.press("Enter");
    await expect(sheet.getByRole("heading", { name: newTag })).toBeVisible({ timeout: 30_000 });
  });
});
