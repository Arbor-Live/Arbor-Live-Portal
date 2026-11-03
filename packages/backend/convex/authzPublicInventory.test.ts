// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { makeTest, type Test } from "./test/setup.helpers";

async function seedPublicItem(
  t: Test,
  opts: {
    assetId: string;
    serialNumber: string;
    publicListing: boolean;
    publicProfile: boolean;
  },
): Promise<Id<"inventoryItems">> {
  const now = Date.now();
  return await t.run(async (ctx) => {
    const typeId = await ctx.db.insert("inventoryTypes", {
      name: `Type ${opts.assetId}`,
      category: "sound",
      model: "Test Model",
      manualUrls: [],
      capabilities: [],
      publicListing: opts.publicListing,
      publicProfile: opts.publicProfile,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.insert("inventoryItems", {
      assetId: opts.assetId,
      serialNumber: opts.serialNumber,
      typeId,
      createdAt: now,
      updatedAt: now,
    });
  });
}

test("exposes serialNumber when the type has publicListing and publicProfile", async () => {
  const t = makeTest();
  await seedPublicItem(t, {
    assetId: "ARBOR-A",
    serialNumber: "SN-A",
    publicListing: true,
    publicProfile: true,
  });

  const result = await t.query(api.publicInventory.equipmentByAssetId, {
    assetId: "ARBOR-A",
  });
  expect(result?.serialNumber).toBe("SN-A");
  expect(result?.type.publicProfileEnabled).toBe(true);
});

test("omits serialNumber when the type is listed without a public profile", async () => {
  const t = makeTest();
  await seedPublicItem(t, {
    assetId: "ARBOR-B",
    serialNumber: "SN-B",
    publicListing: true,
    publicProfile: false,
  });

  const result = await t.query(api.publicInventory.equipmentByAssetId, {
    assetId: "ARBOR-B",
  });
  expect(result).not.toBeNull();
  expect(result?.serialNumber).toBeUndefined();
  expect(result?.type.publicProfileEnabled).toBe(false);
});

test("omits serialNumber when the type is not publicly listed", async () => {
  const t = makeTest();
  await seedPublicItem(t, {
    assetId: "ARBOR-C",
    serialNumber: "SN-C",
    publicListing: false,
    publicProfile: true,
  });

  const result = await t.query(api.publicInventory.equipmentByAssetId, {
    assetId: "ARBOR-C",
  });
  expect(result).not.toBeNull();
  expect(result?.serialNumber).toBeUndefined();
  expect(result?.type.publicProfileEnabled).toBe(false);
});
