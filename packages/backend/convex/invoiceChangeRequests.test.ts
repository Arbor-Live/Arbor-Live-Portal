// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ensureChangeRequestRevision } from "./lib/invoiceRevisions";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
  type Test,
} from "./test/setup.helpers";

const TOKEN = "quote-token-change-requests";

async function seedQuote(t: Test, extra: Record<string, unknown> = {}) {
  const now = Date.now();
  return await t.run(async (ctx) => {
    const invoiceId = await ctx.db.insert("invoices", {
      invoiceNumber: "ALINV-TESTCR1",
      status: "finalized",
      issueDate: "2026-10-01",
      managerUserId: "manager",
      managerName: "Alex Manager",
      managerEmail: "alex@arbor.test",
      clientContactName: "Jordan Client",
      clientEmail: "jordan@client.test",
      equipmentPricingMode: "subsidized",
      crewRateMode: "normal",
      discountType: "amount",
      discountValue: 0,
      discountAmountUsd: 0,
      equipmentSubtotalUsd: 0,
      externalRentalsSubtotalUsd: 0,
      artistsSubtotalUsd: 0,
      crewSubtotalUsd: 0,
      feesSubtotalUsd: 500,
      subtotalUsd: 500,
      totalUsd: 500,
      clientApprovalStatus: "pending",
      publicApprovalToken: TOKEN,
      createdAt: now,
      updatedAt: now,
      ...extra,
    });
    await ctx.db.insert("invoiceLineItems", {
      invoiceId,
      section: "fee",
      order: 0,
      label: "Photographer",
      quantity: 1,
      rateUsd: 500,
      amountUsd: 500,
      createdAt: now,
      updatedAt: now,
    });
    return invoiceId;
  });
}

async function arborStaff(t: Test) {
  const staff = await createUser(t, { role: "admin", name: "Sam Staff" });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, staff._id, arbor.organizationId, "org_admin", true);
  await setActiveOrg(t, staff._id, arbor.organizationId);
  return asUser(t, staff);
}

async function revisionsOf(t: Test, invoiceId: Id<"invoices">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("invoiceRevisions")
      .withIndex("by_invoiceId_and_number", (q) => q.eq("invoiceId", invoiceId))
      .take(50),
  );
}

test("a change request stays in the history after staff reply to it", async () => {
  const t = makeTest();
  const invoiceId = await seedQuote(t);
  const staff = await arborStaff(t);

  await t.mutation(api.invoices.requestChangesByToken, { token: TOKEN, note: "Drop the photographer" });
  await expect(staff.mutation(api.invoices.resetApprovalToPending, { id: invoiceId })).rejects.toThrow(
    /asked for changes/,
  );

  const preview = await staff.query(api.invoices.revisedQuotePreview, { id: invoiceId });
  expect(preview?.request).toMatchObject({ number: 1, note: "Drop the photographer", totalUsd: 500 });

  // Staff drop the line, then reply.
  await t.run(async (ctx) => {
    const line = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId_and_order", (q) => q.eq("invoiceId", invoiceId))
      .first();
    await ctx.db.delete(line!._id);
  });
  const { number } = await staff.mutation(api.invoices.sendRevisedQuote, {
    id: invoiceId,
    message: "Removed it.",
  });
  expect(number).toBe(2);

  const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
  expect(invoice?.clientApprovalStatus).toBe("pending");
  expect(invoice?.clientApprovalNote).toBeUndefined();

  // A second round adds to the history rather than replacing the first.
  await t.mutation(api.invoices.requestChangesByToken, { token: TOKEN, note: "Actually, add it back" });
  const revisions = await revisionsOf(t, invoiceId);
  expect(revisions.map((r) => [r.number, r.kind, r.note, r.totalUsd])).toEqual([
    [1, "changes_requested", "Drop the photographer", 500],
    [2, "sent", "Removed it.", 0],
    [3, "changes_requested", "Actually, add it back", 0],
  ]);
  expect(revisions[0].actorName).toBe("Jordan Client");

  const view = await t.query(api.invoices.getPublicQuoteByToken, { token: TOKEN });
  expect(view?.revisions.map((r) => [r.kind, r.actorName])).toEqual([
    ["changes_requested", "Jordan Client"],
    ["sent", undefined],
    ["changes_requested", "Jordan Client"],
  ]);
});

test("replying needs a message and an open request", async () => {
  const t = makeTest();
  const invoiceId = await seedQuote(t);
  const staff = await arborStaff(t);

  await expect(staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Hi" })).rejects.toThrow(
    /hasn't asked for changes/,
  );
  await t.mutation(api.invoices.requestChangesByToken, { token: TOKEN, note: "Cheaper please" });
  await expect(staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "  " })).rejects.toThrow(
    /what changed/,
  );
});

test("a request made before requests were versions is recorded late, once", async () => {
  const t = makeTest();
  const invoiceId = await seedQuote(t, {
    clientApprovalStatus: "changes_requested",
    changesRequestedAt: 1_700_000_000_000,
    clientApprovalNote: "Earlier load-in",
  });

  await t.run(async (ctx) => {
    const invoice = (await ctx.db.get(invoiceId))!;
    await ensureChangeRequestRevision(ctx, invoice);
    await ensureChangeRequestRevision(ctx, invoice);
  });
  const revisions = await revisionsOf(t, invoiceId);
  expect(revisions).toHaveLength(1);
  expect(revisions[0]).toMatchObject({
    kind: "changes_requested",
    note: "Earlier load-in",
    recordedLate: true,
    createdAt: 1_700_000_000_000,
  });
});
