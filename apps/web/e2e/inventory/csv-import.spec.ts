import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { runConvex, pollConvex } from "../helpers/convex";

const stamp = Date.now();
const typeName = `E2E Import Type ${stamp}`;
const assetId = `E2E-IMP-${String(stamp).slice(-6)}`;
const assetId2 = `E2E-IMP-${String(stamp).slice(-6)}-B`;
const storageLoc = `E2E Import Rack ${stamp}`;

const typeCsvContent = [
  "Item Name,Model Number,Category,MSRP,Non-subsidized Rate (10%),Crew Subsidized (5%),Notes",
  `${typeName},E2E-MODEL-${stamp},misc,2000,200,100,Imported by e2e csv-import spec`,
].join("\n");

const assetCsvContent = [
  "Name,Fungible Inventory,Rollup,MSRP,Large Rate PACK,Small Rate PACK,Storage Loc,Serial,Condition,Description,Contains",
  `${assetId},${typeName},misc,,,,${storageLoc},SN-${stamp},Good,E2E asset from csv-import spec,`,
  `${assetId2},${typeName},misc,,,,${storageLoc},SN-${stamp}-B,Good,E2E second asset,`,
].join("\n");

let typesCsvPath: string;
let assetsCsvPath: string;

test.describe("inventory CSV import", () => {
  test.setTimeout(180_000);

  test.beforeAll(() => {
    const dir = path.join(__dirname, "../fixtures");
    fs.mkdirSync(dir, { recursive: true });
    typesCsvPath = path.join(dir, `csv-import-types-${stamp}.csv`);
    assetsCsvPath = path.join(dir, `csv-import-assets-${stamp}.csv`);
    fs.writeFileSync(typesCsvPath, typeCsvContent, "utf8");
    fs.writeFileSync(assetsCsvPath, assetCsvContent, "utf8");

    // Categories are auto-seeded by the importer's ensureDefaults call,
    // but the page queries existing data on mount and the "misc" category
    // must exist for the create mutation to pass validation.
    runConvex("e2eHelpers:ensureInventoryCategory", {
      key: "misc",
      label: "Misc",
      publicBucket: "misc",
    });
  });

  test.afterAll(() => {
    runConvex("e2eHelpers:deleteInventoryCatalogFixtures", {
      assetIds: [assetId, assetId2],
      typeNames: [typeName],
      locationNames: [storageLoc],
    });
    try { fs.unlinkSync(typesCsvPath); } catch { /* ok */ }
    try { fs.unlinkSync(assetsCsvPath); } catch { /* ok */ }
  });

  test("admin uploads CSVs and types and assets are created", async ({ page }) => {
    await page.goto("/dashboard/inventory/import");
    await expect(page.getByText("CSV Importer")).toBeVisible({ timeout: 30_000 });

    const fileInputs = page.locator('input[type="file"]');
    await fileInputs.nth(0).setInputFiles(typesCsvPath);
    await fileInputs.nth(1).setInputFiles(assetsCsvPath);

    await page.getByRole("button", { name: "Run Import" }).click();

    await expect(page.getByText(/Import complete:/)).toBeVisible({ timeout: 60_000 });

    const created = await pollConvex<{
      typeId: string;
      name: string;
      category: string;
      msrpUsd: number;
      subsidizedRentalPriceUsd: number;
      nonSubsidizedRentalPriceUsd: number;
    }>(
      "e2eHelpers:getInventoryTypeByName",
      { name: typeName },
      (state) => Boolean(state?.typeId),
    );
    expect(created.name).toBe(typeName);
    expect(created.category).toBe("misc");
    expect(created.msrpUsd).toBe(2000);
    expect(created.subsidizedRentalPriceUsd).toBe(100);
    expect(created.nonSubsidizedRentalPriceUsd).toBe(200);

    for (const id of [assetId, assetId2]) {
      const item = await pollConvex<{
        itemId: string;
        assetId: string;
        typeName: string;
        status: string;
        storageLocationPath: string;
      }>(
        "e2eHelpers:getInventoryItemByAssetId",
        { assetId: id },
        (state) => Boolean(state?.itemId),
      );
      expect(item.typeName).toBe(typeName);
      expect(item.storageLocationPath).toContain(storageLoc);
    }
  });
});
