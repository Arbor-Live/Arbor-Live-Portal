// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import { addMembership, asUser, createOrg, createUser, makeTest, setActiveOrg } from "./test/setup.helpers";

async function arborAdmin() {
  const t = makeTest();
  const admin = await createUser(t, { role: "admin" });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, admin._id, arbor.organizationId, "org_admin", true);
  await setActiveOrg(t, admin._id, arbor.organizationId);
  return { t, as: asUser(t, admin), arborId: arbor.organizationId };
}

async function activeNames(as: Awaited<ReturnType<typeof arborAdmin>>["as"]) {
  const hosts = await as.query(api.invoiceGroups.listForAdmin, { includeInactive: true });
  return hosts.filter((host) => host.active).map((host) => host.name);
}

test("restores an archived host whose name is still free", async () => {
  const { as } = await arborAdmin();
  const id = await as.mutation(api.invoiceGroups.create, { name: "Old Union Board", type: "vso" });
  await as.mutation(api.invoiceGroups.archive, { id });

  await as.mutation(api.invoiceGroups.restore, { id });

  expect(await activeNames(as)).toEqual(["Old Union Board"]);
});

test("refuses to restore a host that was merged away", async () => {
  const { as } = await arborAdmin();
  const survivorId = await as.mutation(api.invoiceGroups.create, { name: "Stanford Concert Network", type: "vso" });
  const victimId = await as.mutation(api.invoiceGroups.create, { name: "SCN Duplicate", type: "vso" });
  await as.mutation(api.invoiceGroups.merge, { survivorId, victimIds: [victimId] });

  await expect(as.mutation(api.invoiceGroups.restore, { id: victimId })).rejects.toThrow(
    /now points to the active host "Stanford Concert Network"/,
  );
  expect(await activeNames(as)).toEqual(["Stanford Concert Network"]);
});

test("refuses to restore a host whose name a new host took", async () => {
  const { as } = await arborAdmin();
  const oldId = await as.mutation(api.invoiceGroups.create, { name: "Music Department", type: "department" });
  await as.mutation(api.invoiceGroups.archive, { id: oldId });
  await as.mutation(api.invoiceGroups.create, { name: "Music Department", type: "department" });

  await expect(as.mutation(api.invoiceGroups.restore, { id: oldId })).rejects.toThrow(/now points to the active host/);
});

test("refuses to restore a host whose alias a new host took", async () => {
  const { as } = await arborAdmin();
  const oldId = await as.mutation(api.invoiceGroups.create, { name: "Stanford Concert Network", type: "vso" });
  await as.mutation(api.invoiceGroups.addAlias, { groupId: oldId, alias: "SCN" });
  await as.mutation(api.invoiceGroups.archive, { id: oldId });
  await as.mutation(api.invoiceGroups.create, { name: "SCN", type: "vso" });

  await expect(as.mutation(api.invoiceGroups.restore, { id: oldId })).rejects.toThrow(
    /"SCN" now points to the active host "SCN"/,
  );
});

test("counts only active contacts", async () => {
  const { as } = await arborAdmin();
  const groupId = await as.mutation(api.invoiceGroups.create, { name: "Dance Marathon", type: "vso" });
  const contactId = await as.mutation(api.invoiceContacts.create, { groupId, firstName: "Ana", lastName: "Ruiz" });
  await as.mutation(api.invoiceContacts.create, { groupId, firstName: "Ben", lastName: "Cho" });
  await as.mutation(api.invoiceContacts.archive, { id: contactId });

  const [host] = await as.query(api.invoiceGroups.listForAdmin, {});
  expect(host.contactCount).toBe(1);
});

test("clears a contact's email and phone and drops its person link", async () => {
  const { t, as } = await arborAdmin();
  const groupId = await as.mutation(api.invoiceGroups.create, { name: "Cardinal Ballet", type: "vso" });
  const id = await as.mutation(api.invoiceContacts.create, {
    groupId,
    firstName: "Ana",
    lastName: "Ruiz",
    email: "ana@example.com",
    phone: "6505550100",
  });

  await as.mutation(api.invoiceContacts.update, { id, email: "", phone: "" });

  const stored = await t.run(async (ctx) => await ctx.db.get(id));
  expect([stored?.email, stored?.phone, stored?.personId]).toEqual([undefined, undefined, undefined]);
});

test("only restore can reactivate a host", async () => {
  const { as } = await arborAdmin();
  const id = await as.mutation(api.invoiceGroups.create, { name: "Old Union Board", type: "vso" });
  await as.mutation(api.invoiceGroups.archive, { id });

  await expect(
    as.mutation(api.invoiceGroups.update, { id, active: true } as never),
  ).rejects.toThrow(/Unexpected field `active`/);
  expect(await activeNames(as)).toEqual([]);
});

test("merging a host carries its aliases over to the survivor", async () => {
  const { as } = await arborAdmin();
  const survivorId = await as.mutation(api.invoiceGroups.create, { name: "Office of Student Engagement", type: "department" });
  const victimId = await as.mutation(api.invoiceGroups.create, { name: "Student Engagement", type: "department" });
  await as.mutation(api.invoiceGroups.addAlias, { groupId: victimId, alias: "OSE" });

  await as.mutation(api.invoiceGroups.merge, { survivorId, victimIds: [victimId] });

  const aliases = await as.query(api.invoiceGroups.listAliases, { groupId: survivorId });
  expect(aliases.map((row) => row.alias).sort()).toEqual(["OSE", "Student Engagement"]);
});

test("the merge preview counts every contact that moves, archived ones included", async () => {
  const { as } = await arborAdmin();
  const survivorId = await as.mutation(api.invoiceGroups.create, { name: "Dance Marathon", type: "vso" });
  const victimId = await as.mutation(api.invoiceGroups.create, { name: "Dance Marathon Board", type: "vso" });
  const archived = await as.mutation(api.invoiceContacts.create, { groupId: victimId, firstName: "Ana", lastName: "Ruiz" });
  await as.mutation(api.invoiceContacts.create, { groupId: victimId, firstName: "Ben", lastName: "Cho" });
  await as.mutation(api.invoiceContacts.archive, { id: archived });

  const preview = await as.query(api.invoiceGroups.getMergePreview, { survivorId, victimIds: [victimId] });
  expect(preview.victims.map((row) => row.contactCount)).toEqual([2]);
});

test("a merge can take an alias that only an archived host held", async () => {
  const { as } = await arborAdmin();
  const oldId = await as.mutation(api.invoiceGroups.create, { name: "Stanford Concert Network", type: "vso" });
  await as.mutation(api.invoiceGroups.addAlias, { groupId: oldId, alias: "SCN" });
  await as.mutation(api.invoiceGroups.archive, { id: oldId });
  const victimId = await as.mutation(api.invoiceGroups.create, { name: "SCN", type: "vso" });
  const survivorId = await as.mutation(api.invoiceGroups.create, { name: "Concert Network", type: "vso" });

  await as.mutation(api.invoiceGroups.merge, { survivorId, victimIds: [victimId] });

  const aliases = await as.query(api.invoiceGroups.listAliases, { groupId: survivorId });
  expect(aliases.map((row) => row.alias)).toEqual(["SCN"]);
});

test("a merge keeps one alias when the survivor already has it", async () => {
  const { as } = await arborAdmin();
  const survivorId = await as.mutation(api.invoiceGroups.create, { name: "Office of Student Engagement", type: "department" });
  await as.mutation(api.invoiceGroups.addAlias, { groupId: survivorId, alias: "OSE" });
  const victimId = await as.mutation(api.invoiceGroups.create, { name: "Student Engagement", type: "department" });
  await as.mutation(api.invoiceGroups.addAlias, { groupId: victimId, alias: "Engagement Office" });

  await as.mutation(api.invoiceGroups.merge, { survivorId, victimIds: [victimId] });

  const aliases = await as.query(api.invoiceGroups.listAliases, { groupId: survivorId });
  expect(aliases.map((row) => [row.alias, row.source])).toEqual([
    ["Engagement Office", "manual"],
    ["OSE", "manual"],
    ["Student Engagement", "merge"],
  ]);
});

test("renaming a host keeps its old name as an alias", async () => {
  const { as } = await arborAdmin();
  const id = await as.mutation(api.invoiceGroups.create, { name: "Foo Club", type: "vso" });

  await as.mutation(api.invoiceGroups.update, { id, name: "Bar Club" });

  const aliases = await as.query(api.invoiceGroups.listAliases, { groupId: id });
  expect(aliases.map((row) => [row.alias, row.source])).toEqual([["Foo Club", "rename"]]);
});

test("an active host saved before name indexing still blocks a duplicate", async () => {
  const { t, as } = await arborAdmin();
  const archivedId = await as.mutation(api.invoiceGroups.create, { name: "Music Department", type: "department" });
  await as.mutation(api.invoiceGroups.archive, { id: archivedId });
  await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("invoiceGroups", {
      name: "Music Department",
      type: "department",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  await expect(
    as.mutation(api.invoiceGroups.create, { name: "Music Department", type: "department" }),
  ).rejects.toThrow(/already exists as "Music Department"/);
});

test("staff without admin or operations access can't rename a host", async () => {
  const { t, as, arborId } = await arborAdmin();
  const id = await as.mutation(api.invoiceGroups.create, { name: "Dance Marathon", type: "vso" });
  const crew = await createUser(t, { role: "member" });
  await addMembership(t, crew._id, arborId, "org_member", true);
  await setActiveOrg(t, crew._id, arborId);

  await expect(asUser(t, crew).mutation(api.invoiceGroups.update, { id, name: "Renamed" })).rejects.toThrow(
    /Operations team access required/,
  );
  expect(await activeNames(as)).toEqual(["Dance Marathon"]);
});
