// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
} from "./test/setup";

const STORED_PAYEE = "payee@band.test";

async function bandContextWithPayee() {
  const t = makeTest();
  const band = await createOrg(t, { type: "band" });
  await t.run(async (ctx) => {
    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", band.organizationId))
      .unique();
    if (!profile) throw new Error("setup: band profile missing");
    await ctx.db.patch(profile._id, {
      designatedPayeeName: "Band Payee",
      designatedPayeeEmail: STORED_PAYEE,
    });
  });

  const member = await createUser(t);
  await addMembership(t, member._id, band.organizationId, "member", true);
  await setActiveOrg(t, member._id, band.organizationId);

  const orgAdmin = await createUser(t);
  await addMembership(t, orgAdmin._id, band.organizationId, "org_admin", true);
  await setActiveOrg(t, orgAdmin._id, band.organizationId);

  return { t, band, member, orgAdmin };
}

test("rejects a band member changing who gets paid", async () => {
  const { t, member } = await bandContextWithPayee();

  await expect(
    asUser(t, member).mutation(api.users.updateActiveBandProfile, {
      designatedPayeeEmail: "new-payee@band.test",
    }),
  ).rejects.toThrow(/Only an artist admin can change who gets paid/);
});

test("allows a band member resubmitting the unchanged payee value", async () => {
  const { t, band, member } = await bandContextWithPayee();

  await asUser(t, member).mutation(api.users.updateActiveBandProfile, {
    displayName: "Renamed Band",
    designatedPayeeName: "Band Payee",
    designatedPayeeEmail: STORED_PAYEE,
  });

  const profile = await t.run(async (ctx) =>
    ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", band.organizationId))
      .unique(),
  );
  expect(profile?.displayName).toBe("Renamed Band");
  expect(profile?.designatedPayeeEmail).toBe(STORED_PAYEE);
});

test("allows a band org_admin to change who gets paid", async () => {
  const { t, band, orgAdmin } = await bandContextWithPayee();

  await asUser(t, orgAdmin).mutation(api.users.updateActiveBandProfile, {
    designatedPayeeEmail: "new-payee@band.test",
  });

  const profile = await t.run(async (ctx) =>
    ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", band.organizationId))
      .unique(),
  );
  expect(profile?.designatedPayeeEmail).toBe("new-payee@band.test");
});
