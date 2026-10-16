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
  type Test,
} from "./test/setup.helpers";

const PAYEE_EMAIL = "invited-payee@band.test";

/** A queued payout whose payee was picked as a pending invite (email only, no account link). */
async function payoutWithEmailOnlyPayee() {
  const t = makeTest();
  const band = await createOrg(t, { type: "band" });
  const now = Date.now();
  const paymentId = await t.run(async (ctx) => {
    const profile = await ctx.db
      .query("organizationProfiles")
      .withIndex("by_organizationId", (q) => q.eq("organizationId", band.organizationId))
      .unique();
    if (!profile) throw new Error("setup: band profile missing");
    await ctx.db.patch(profile._id, {
      designatedPayeeName: "Invited Payee",
      designatedPayeeEmail: PAYEE_EMAIL,
      designatedPayeeMailingAddress: "1 Main St, Stanford, CA",
      designatedPayeePayoutMethod: "pickup",
    });
    const eventId = await ctx.db.insert("events", {
      title: "Test Event",
      status: "ready",
      visibility: "internal",
      startAt: now - 7_200_000,
      endAt: now - 3_600_000,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.insert("eventBandPayments", {
      eventId,
      organizationId: band.organizationId,
      pricingMode: "fixed_total",
      totalUsd: 500,
      status: "pending_email",
      confirmationToken: "test-token",
      designatedPayeeName: "Invited Payee",
      designatedPayeeEmail: PAYEE_EMAIL,
      createdAt: now,
      updatedAt: now,
    });
  });

  const staff = await createUser(t, { role: "admin" });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, staff._id, arbor.organizationId, "admin", true);
  return { t, band, staff, paymentId };
}

async function getPayment(t: Test, paymentId: Id<"eventBandPayments">) {
  return await t.run(async (ctx) => ctx.db.get(paymentId));
}

test("links an invited payee by email once they've joined, then sends", async () => {
  const { t, band, staff, paymentId } = await payoutWithEmailOnlyPayee();
  const payee = await createUser(t, { email: PAYEE_EMAIL, name: "Invited Payee" });
  await addMembership(t, payee._id, band.organizationId, "member", true);

  await asUser(t, staff).mutation(api.bandPayments.sendConfirmationEmail, { paymentId });

  const payment = await getPayment(t, paymentId);
  expect(payment?.status).toBe("awaiting_confirmation");
  expect(payment?.designatedPayeeUserId).toBe(payee._id);
});

test("names the payee when they haven't joined the act yet", async () => {
  const { t, staff, paymentId } = await payoutWithEmailOnlyPayee();

  await expect(
    asUser(t, staff).mutation(api.bandPayments.sendConfirmationEmail, { paymentId }),
  ).rejects.toThrow(/Invited Payee \(invited-payee@band\.test\) isn't a member of this act yet/);
  expect((await getPayment(t, paymentId))?.status).toBe("pending_email");
});
