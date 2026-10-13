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
} from "./test/setup.helpers";

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

test("tells a band member they cannot edit payout and who the admins are", async () => {
  const { t, member, orgAdmin } = await bandContextWithPayee();

  const memberView = await asUser(t, member).query(api.users.getActiveBandProfile, {});
  expect(memberView.canEditPayout).toBe(false);
  expect(memberView.artistAdminNames).toEqual([orgAdmin.name]);

  const adminView = await asUser(t, orgAdmin).query(api.users.getActiveBandProfile, {});
  expect(adminView.canEditPayout).toBe(true);
});

test("lets Arbor staff promote a band member to artist admin", async () => {
  const { t, band, member } = await bandContextWithPayee();
  const staff = await createUser(t, { role: "admin" });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, staff._id, arbor.organizationId, "admin", true);

  const result = await asUser(t, staff).mutation(
    api.users.updateUserOrganizationMembershipRoleAdmin,
    { userId: member._id, organizationId: band.organizationId, role: "org_admin" },
  );
  expect(result.role).toBe("org_admin");

  await asUser(t, member).mutation(api.users.updateActiveBandProfile, {
    designatedPayeeEmail: "new-payee@band.test",
  });
  const view = await asUser(t, member).query(api.users.getActiveBandProfile, {});
  expect(view.canEditPayout).toBe(true);
  expect(view.designatedPayeeEmail).toBe("new-payee@band.test");
});

test("refuses a band admin changing membership roles through the staff mutation", async () => {
  const { t, band, member, orgAdmin } = await bandContextWithPayee();

  await expect(
    asUser(t, orgAdmin).mutation(api.users.updateUserOrganizationMembershipRoleAdmin, {
      userId: member._id,
      organizationId: band.organizationId,
      role: "org_admin",
    }),
  ).rejects.toThrow(/Admin access required/);
});

test("reports whether an artist org has an active admin", async () => {
  const { t, orgAdmin } = await bandContextWithPayee();
  const staff = await createUser(t, { role: "admin" });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, staff._id, arbor.organizationId, "admin", true);
  const emptyBand = await createOrg(t, { type: "band" });
  const member = await createUser(t);
  await addMembership(t, member._id, emptyBand.organizationId, "org_member", true);

  const asStaff = asUser(t, staff);
  expect(
    await asStaff.query(api.users.organizationHasActiveAdminAdmin, {
      organizationId: emptyBand.organizationId,
    }),
  ).toBe(false);
  await addMembership(t, orgAdmin._id, emptyBand.organizationId, "org_admin", true);
  expect(
    await asStaff.query(api.users.organizationHasActiveAdminAdmin, {
      organizationId: emptyBand.organizationId,
    }),
  ).toBe(true);
});

test("lets a member save the profile when no rate was ever set", async () => {
  const { t, band, member } = await bandContextWithPayee();

  // The profile query reports the missing rate as 0, and forms resend it.
  await asUser(t, member).mutation(api.users.updateActiveBandProfile, {
    displayName: "Renamed Band",
    performerHourlyRateUsd: 0,
  });

  const profile = await t.run(async (ctx) =>
    ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", band.organizationId))
      .unique(),
  );
  expect(profile?.displayName).toBe("Renamed Band");
});
