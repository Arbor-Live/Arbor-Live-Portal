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
  return asUser(t, admin);
}

async function activeNames(as: Awaited<ReturnType<typeof arborAdmin>>) {
  const hosts = await as.query(api.invoiceGroups.listForAdmin, { includeInactive: true });
  return hosts.filter((host) => host.active).map((host) => host.name);
}

test("restores an archived host whose name is still free", async () => {
  const as = await arborAdmin();
  const id = await as.mutation(api.invoiceGroups.create, { name: "Old Union Board", type: "vso" });
  await as.mutation(api.invoiceGroups.archive, { id });

  await as.mutation(api.invoiceGroups.restore, { id });

  expect(await activeNames(as)).toEqual(["Old Union Board"]);
});

test("refuses to restore a host that was merged away", async () => {
  const as = await arborAdmin();
  const survivorId = await as.mutation(api.invoiceGroups.create, { name: "Stanford Concert Network", type: "vso" });
  const victimId = await as.mutation(api.invoiceGroups.create, { name: "SCN Duplicate", type: "vso" });
  await as.mutation(api.invoiceGroups.merge, { survivorId, victimIds: [victimId] });

  await expect(as.mutation(api.invoiceGroups.restore, { id: victimId })).rejects.toThrow(
    /now points to the active host "Stanford Concert Network"/,
  );
  expect(await activeNames(as)).toEqual(["Stanford Concert Network"]);
});

test("refuses to restore a host whose name a new host took", async () => {
  const as = await arborAdmin();
  const oldId = await as.mutation(api.invoiceGroups.create, { name: "Music Department", type: "department" });
  await as.mutation(api.invoiceGroups.archive, { id: oldId });
  await as.mutation(api.invoiceGroups.create, { name: "Music Department", type: "department" });

  await expect(as.mutation(api.invoiceGroups.restore, { id: oldId })).rejects.toThrow(/now points to the active host/);
});

test("counts only active contacts", async () => {
  const as = await arborAdmin();
  const groupId = await as.mutation(api.invoiceGroups.create, { name: "Dance Marathon", type: "vso" });
  const contactId = await as.mutation(api.invoiceContacts.create, { groupId, firstName: "Ana", lastName: "Ruiz" });
  await as.mutation(api.invoiceContacts.create, { groupId, firstName: "Ben", lastName: "Cho" });
  await as.mutation(api.invoiceContacts.archive, { id: contactId });

  const [host] = await as.query(api.invoiceGroups.listForAdmin, {});
  expect(host.contactCount).toBe(1);
});

test("clears a contact's email and phone when sent empty", async () => {
  const as = await arborAdmin();
  const groupId = await as.mutation(api.invoiceGroups.create, { name: "Cardinal Ballet", type: "vso" });
  const id = await as.mutation(api.invoiceContacts.create, {
    groupId,
    firstName: "Ana",
    lastName: "Ruiz",
    email: "ana@example.com",
    phone: "6505550100",
  });

  await as.mutation(api.invoiceContacts.update, { id, email: "", phone: "" });

  const [contact] = await as.query(api.invoiceContacts.listForAdmin, { groupId });
  expect([contact.email ?? "", contact.phone ?? ""]).toEqual(["", ""]);
});
