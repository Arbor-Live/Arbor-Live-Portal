// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
} from "./test/setup.helpers";

test("refuses a band org admin whose cached role is admin", async () => {
  const t = makeTest();
  const bandAdmin = await createUser(t, { role: "admin" });
  const band = await createOrg(t, { type: "band" });
  await addMembership(t, bandAdmin._id, band.organizationId, "org_admin", true);

  await expect(
    asUser(t, bandAdmin).query(api.users.listUsersForAdmin, {}),
  ).rejects.toThrow(/Admin access required/);
});

test("allows an Arbor org_admin", async () => {
  const t = makeTest();
  const arborAdmin = await createUser(t, { role: "admin" });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, arborAdmin._id, arbor.organizationId, "org_admin", true);

  const users = await asUser(t, arborAdmin).query(api.users.listUsersForAdmin, {});
  expect(Array.isArray(users)).toBe(true);
});
