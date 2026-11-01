// @vitest-environment edge-runtime
import { expect, test, vi } from "vitest";
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
  expect(preview?.basis).toMatchObject({
    kind: "changes_requested",
    number: 1,
    note: "Drop the photographer",
    totalUsd: 500,
  });

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

async function quoteUpdatedEmails(t: Test) {
  const rows = await t.run(async (ctx) =>
    (await ctx.db.query("emailNotifications").collect()).filter((row) => row.template === "quote_updated"),
  );
  return rows.map((row) => {
    const payload = row.payload as { reason?: string; previousTotalUsd?: number; newTotalUsd: number };
    return [payload.reason, payload.previousTotalUsd, payload.newTotalUsd];
  });
}

test("staff send a revised quote without a change request", async () => {
  const t = makeTest();
  const invoiceId = await seedQuote(t);
  const staff = await arborStaff(t);

  await expect(staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "  " })).rejects.toThrow(
    /what changed/,
  );
  expect(await staff.query(api.invoices.revisedQuotePreview, { id: invoiceId })).toMatchObject({
    basis: { kind: "revision", number: null, totalUsd: null },
    current: { totalUsd: 500 },
  });

  await t.run(async (ctx) => {
    const line = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId_and_order", (q) => q.eq("invoiceId", invoiceId))
      .first();
    await ctx.db.patch(line!._id, { rateUsd: 400, amountUsd: 400 });
  });
  expect(
    await staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Photographer at $400." }),
  ).toEqual({ number: 1 });
  expect(await staff.query(api.invoices.revisedQuotePreview, { id: invoiceId })).toMatchObject({
    basis: { kind: "revision", number: 1, totalUsd: 400 },
  });
  expect(
    await staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Same quote, new dates." }),
  ).toEqual({ number: 2 });

  const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
  expect(invoice?.clientApprovalStatus).toBe("pending");
  const revisions = await revisionsOf(t, invoiceId);
  expect(revisions.map((r) => [r.number, r.kind, r.note, r.totalUsd, r.actorName])).toEqual([
    [1, "sent", "Photographer at $400.", 400, "Sam Staff"],
    [2, "sent", "Same quote, new dates.", 400, "Sam Staff"],
  ]);
  expect(await quoteUpdatedEmails(t)).toEqual([
    ["revised", undefined, 400],
    ["revised", 400, 400],
  ]);
});

test("a standalone quote needs the client's email to send", async () => {
  const t = makeTest();
  const invoiceId = await seedQuote(t, { clientEmail: undefined });
  const staff = await arborStaff(t);

  await expect(staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Hi" })).rejects.toThrow(
    /client's email/,
  );
  expect(await revisionsOf(t, invoiceId)).toEqual([]);
});

test("a standalone quote needs a live link to send", async () => {
  const t = makeTest();
  const invoiceId = await seedQuote(t, { publicApprovalTokenExpiresAt: Date.now() - 1000 });
  const staff = await arborStaff(t);

  await expect(staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Hi" })).rejects.toThrow(
    /link has expired/,
  );
  expect(await revisionsOf(t, invoiceId)).toEqual([]);
});

test("a request-portal quote is revised on the portal once it's there", async () => {
  vi.stubEnv("E2E_HELPERS", "true");
  vi.stubEnv("SITE_URL", "http://localhost:3000");
  try {
    const t = makeTest();
    const staff = await arborStaff(t);
    const { invoiceId } = await t.mutation(api.e2eHelpers.seedRequestLinkedDraftQuote, {});

    await expect(staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Hi" })).rejects.toThrow(
      /Send the quote to the client first/,
    );
    expect(await staff.query(api.invoices.revisedQuotePreview, { id: invoiceId })).toBeNull();

    await staff.mutation(api.invoices.markReadyForClientReview, { id: invoiceId, clientMessage: "First send." });
    expect(
      await staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Moved load-in." }),
    ).toEqual({ number: 2 });

    const invoice = await t.run(async (ctx) => ctx.db.get(invoiceId));
    expect(invoice).toMatchObject({
      status: "finalized",
      clientApprovalStatus: "pending",
      clientReadyMessage: "Moved load-in.",
    });
    const revisions = await revisionsOf(t, invoiceId);
    expect(revisions.map((r) => [r.number, r.kind, r.note])).toEqual([
      [1, "sent", "First send."],
      [2, "sent", "Moved load-in."],
    ]);
  } finally {
    vi.unstubAllEnvs();
  }
});

test("an approved quote goes back through re-approval, not a revised send", async () => {
  const t = makeTest();
  const invoiceId = await seedQuote(t, { clientApprovalStatus: "approved", approvedAt: Date.now() });
  const staff = await arborStaff(t);

  await expect(staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Hi" })).rejects.toThrow(
    /approved this quote/,
  );
  expect(await staff.query(api.invoices.revisedQuotePreview, { id: invoiceId })).toBeNull();
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
