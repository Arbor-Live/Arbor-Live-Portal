// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
  type Test,
  type TestUser,
} from "./test/setup";

async function seedInventoryType(t: Test, name: string): Promise<Id<"inventoryTypes">> {
  const now = Date.now();
  return await t.run(async (ctx) =>
    ctx.db.insert("inventoryTypes", {
      name,
      category: "sound",
      model: "Test Model",
      manualUrls: [],
      capabilities: [],
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function bandMember(t: Test): Promise<TestUser> {
  const user = await createUser(t);
  const band = await createOrg(t, { type: "band" });
  await addMembership(t, user._id, band.organizationId, "member", true);
  await setActiveOrg(t, user._id, band.organizationId);
  return user;
}

async function arborStaff(t: Test, role: "admin" | "member"): Promise<TestUser> {
  const user = await createUser(t, { role });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(
    t,
    user._id,
    arbor.organizationId,
    role === "admin" ? "org_admin" : "member",
    true,
  );
  await setActiveOrg(t, user._id, arbor.organizationId);
  return user;
}

test("refuses inventoryItems.create in a band active-org context", async () => {
  const t = makeTest();
  const member = await bandMember(t);
  const typeId = await seedInventoryType(t, "Microphone");

  await expect(
    asUser(t, member).mutation(api.inventoryItems.create, {
      typeId,
      serialNumber: "SN-BAND-1",
    }),
  ).rejects.toThrow(/Arbor internal organization context/);
});

test("allows inventoryItems.create for Arbor staff", async () => {
  const t = makeTest();
  const staff = await arborStaff(t, "member");
  const typeId = await seedInventoryType(t, "Microphone");

  const itemId = await asUser(t, staff).mutation(api.inventoryItems.create, {
    assetId: "ARBOR-1",
    typeId,
    serialNumber: "SN-STAFF-1",
  });
  const item = await t.run(async (ctx) => ctx.db.get(itemId));
  expect(item?.serialNumber).toBe("SN-STAFF-1");
});

test("refuses storageLocations.create in a band active-org context", async () => {
  const t = makeTest();
  const member = await bandMember(t);

  await expect(
    asUser(t, member).mutation(api.storageLocations.create, { name: "Shop" }),
  ).rejects.toThrow(/Arbor internal organization context/);
});

test("allows storageLocations.create for Arbor staff", async () => {
  const t = makeTest();
  const staff = await arborStaff(t, "member");

  const locationId = await asUser(t, staff).mutation(api.storageLocations.create, {
    name: "Shop",
  });
  const location = await t.run(async (ctx) => ctx.db.get(locationId));
  expect(location?.path).toBe("Shop");
});

test("refuses inventoryTypes.update for non-admin Arbor staff", async () => {
  const t = makeTest();
  const staff = await arborStaff(t, "member");
  const typeId = await seedInventoryType(t, "Microphone");

  await expect(
    asUser(t, staff).mutation(api.inventoryTypes.update, {
      id: typeId,
      name: "Renamed",
      category: "sound",
      model: "Test Model",
    }),
  ).rejects.toThrow(/Admin access required/);
});

test("allows inventoryTypes.update for an Arbor admin", async () => {
  const t = makeTest();
  const admin = await arborStaff(t, "admin");
  const typeId = await seedInventoryType(t, "Microphone");

  await asUser(t, admin).mutation(api.inventoryTypes.update, {
    id: typeId,
    name: "Renamed",
    category: "sound",
    model: "Test Model",
  });
  const updated = await t.run(async (ctx) => ctx.db.get(typeId));
  expect(updated?.name).toBe("Renamed");
});

test("refuses inventoryTypes.remove for non-admin Arbor staff", async () => {
  const t = makeTest();
  const staff = await arborStaff(t, "member");
  const typeId = await seedInventoryType(t, "Microphone");

  await expect(
    asUser(t, staff).mutation(api.inventoryTypes.remove, { id: typeId }),
  ).rejects.toThrow(/Admin access required/);
});

test("allows inventoryTypes.remove for an Arbor admin", async () => {
  const t = makeTest();
  const admin = await arborStaff(t, "admin");
  const typeId = await seedInventoryType(t, "Microphone");

  await asUser(t, admin).mutation(api.inventoryTypes.remove, { id: typeId });
  const deleted = await t.run(async (ctx) => ctx.db.get(typeId));
  expect(deleted).toBeNull();
});
