// @vitest-environment edge-runtime
import { expect, test, vi } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ensureChangeRequestRevision } from "./lib/invoiceRevisions";
import { REQUEST_PUBLIC_TOKEN_TTL_MS } from "./lib/requestToken";
import { seedInvoice, seedRequest } from "./test/bookingSeeds.helpers";
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
    return [row.subject, payload.reason, payload.previousTotalUsd, payload.newTotalUsd];
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
    ["Arbor Live booking: Your event (ALINV-TESTCR1)", "revised", undefined, 400],
    ["Re: Arbor Live booking: Your event (ALINV-TESTCR1)", "revised", 400, 400],
  ]);
});

test("a change request is about the version the client was sent, not unsent edits", async () => {
  const t = makeTest();
  const invoiceId = await seedQuote(t);
  const staff = await arborStaff(t);

  await staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Here's your quote." });

  await t.run(async (ctx) => {
    const line = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId_and_order", (q) => q.eq("invoiceId", invoiceId))
      .first();
    await ctx.db.patch(line!._id, { rateUsd: 800, amountUsd: 800 });
  });
  await t.mutation(api.invoices.requestChangesByToken, { token: TOKEN, note: "Can we lower the price?" });

  expect(await staff.query(api.invoices.revisedQuotePreview, { id: invoiceId })).toMatchObject({
    basis: { kind: "changes_requested", number: 2, totalUsd: 500 },
    current: { totalUsd: 800 },
  });

  await staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Updated pricing." });
  const revisions = await revisionsOf(t, invoiceId);
  expect(revisions.map((r) => [r.number, r.kind, r.totalUsd, r.lines[0]?.rateUsd])).toEqual([
    [1, "sent", 500, 500],
    [2, "changes_requested", 500, 500],
    [3, "sent", 800, 800],
  ]);
});

test("a change request after staff reopen an approval is about the approved version", async () => {
  const t = makeTest();
  const invoiceId = await seedQuote(t);
  const staff = await arborStaff(t);

  await staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Here's your quote." });
  await t.mutation(api.invoices.approveByToken, {
    token: TOKEN,
    signedName: "Jordan Client",
    clientIsPaymentSubmitter: true,
  });
  await staff.mutation(api.invoices.resetApprovalToPending, { id: invoiceId });

  await t.run(async (ctx) => {
    const line = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId_and_order", (q) => q.eq("invoiceId", invoiceId))
      .first();
    await ctx.db.patch(line!._id, { rateUsd: 800, amountUsd: 800 });
  });
  await t.mutation(api.invoices.requestChangesByToken, { token: TOKEN, note: "Can we lower the price?" });

  const revisions = await revisionsOf(t, invoiceId);
  expect(revisions.map((r) => [r.number, r.kind, r.totalUsd])).toEqual([
    [1, "sent", 500],
    [2, "approved", 500],
    [3, "changes_requested", 500],
  ]);
});

test("a change request skips an approved-quote edit the client was never sent", async () => {
  const t = makeTest();
  const invoiceId = await seedQuote(t);
  const staff = await arborStaff(t);

  await staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Here's your quote." });
  await t.mutation(api.invoices.approveByToken, {
    token: TOKEN,
    signedName: "Jordan Client",
    clientIsPaymentSubmitter: true,
  });
  await staff.mutation(api.invoices.updateDraft, {
    id: invoiceId,
    issueDate: "2026-10-01",
    managerUserId: "manager",
    managerName: "Alex Manager",
    clientContactName: "Jordan Client",
    clientEmail: "jordan@client.test",
    equipmentPricingMode: "subsidized",
    crewRateMode: "normal",
    discountType: "amount",
    discountValue: 0,
    lineItems: [{ section: "fee", order: 0, label: "Photographer", quantity: 1, rateUsd: 800 }],
    approvedChange: { decision: "keep_approval", note: "Internal rate correction" },
  });
  await staff.mutation(api.invoices.resetApprovalToPending, { id: invoiceId });
  await t.mutation(api.invoices.requestChangesByToken, { token: TOKEN, note: "Can we lower the price?" });

  const revisions = await revisionsOf(t, invoiceId);
  expect(revisions.map((r) => [r.number, r.kind, r.totalUsd])).toEqual([
    [1, "sent", 500],
    [2, "approved", 500],
    [3, "change_kept_approval", 800],
    [4, "changes_requested", 500],
  ]);
  expect(await staff.query(api.invoices.revisedQuotePreview, { id: invoiceId })).toMatchObject({
    basis: { kind: "changes_requested", number: 4, totalUsd: 500 },
    current: { totalUsd: 800 },
  });
});

test("a standalone quote needs the client's email to send", async () => {
  const t = makeTest();
  const invoiceId = await seedQuote(t, { clientEmail: undefined });
  const staff = await arborStaff(t);

  await expect(staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Hi" })).rejects.toThrow(
    /client's email/,
  );
  expect(await staff.query(api.invoices.revisedQuotePreview, { id: invoiceId })).toMatchObject({
    blocked: "Add the client's email so they get the quote.",
  });
  expect(await revisionsOf(t, invoiceId)).toEqual([]);
});

test("a standalone quote needs a live link to send", async () => {
  const t = makeTest();
  const expired = await seedQuote(t, { publicApprovalTokenExpiresAt: Date.now() - 1000 });
  const missing = await seedQuote(t, { publicApprovalToken: undefined });
  const staff = await arborStaff(t);

  for (const invoiceId of [expired, missing]) {
    await expect(staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Hi" })).rejects.toThrow(
      /link has expired/,
    );
    expect(await revisionsOf(t, invoiceId)).toEqual([]);
  }
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
    expect(await staff.query(api.invoices.revisedQuotePreview, { id: invoiceId })).toMatchObject({
      blocked: "Send the quote to the client first.",
    });

    await staff.mutation(api.invoices.markReadyForClientReview, { id: invoiceId, clientMessage: "First send." });
    expect(
      await staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Moved load-in." }),
    ).toEqual({ number: 2 });

    const { requestId } = await t.mutation(api.e2eHelpers.seedRequestLinkedDraftQuote, {});
    const stale = await t.run(async (ctx) => (await ctx.db.get(requestId))!.linkedInvoiceId!);
    await staff.mutation(api.invoices.markReadyForClientReview, { id: stale, clientMessage: "First send." });
    await t.run(async (ctx) => ctx.db.patch(requestId, { submittedAt: Date.now() - REQUEST_PUBLIC_TOKEN_TTL_MS - 1 }));
    await expect(staff.mutation(api.invoices.sendRevisedQuote, { id: stale, message: "Hi" })).rejects.toThrow(
      /request portal link has expired/,
    );

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
  expect(await staff.query(api.invoices.revisedQuotePreview, { id: invoiceId })).toMatchObject({
    blocked: expect.stringMatching(/approved this quote/),
  });
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

test("a request recorded late is about the version the client was sent, not later edits", async () => {
  const t = makeTest();
  const invoiceId = await seedQuote(t, {
    clientApprovalStatus: "changes_requested",
    changesRequestedAt: 1_700_000_000_000,
    clientApprovalNote: "Earlier load-in",
  });

  await t.run(async (ctx) => {
    await ctx.db.insert("invoiceRevisions", {
      invoiceId,
      number: 1,
      kind: "approved",
      totalUsd: 500,
      subtotalUsd: 500,
      discountAmountUsd: 0,
      lines: [{ section: "fee", label: "Photographer", quantity: 1, rateUsd: 500, amountUsd: 500 }],
      createdAt: 1_690_000_000_000,
    });
    const line = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId_and_order", (q) => q.eq("invoiceId", invoiceId))
      .first();
    await ctx.db.patch(line!._id, { rateUsd: 800, amountUsd: 800 });
    await ensureChangeRequestRevision(ctx, (await ctx.db.get(invoiceId))!);
  });

  const revisions = await revisionsOf(t, invoiceId);
  expect(revisions.map((r) => [r.number, r.kind, r.totalUsd])).toEqual([
    [1, "approved", 500],
    [2, "changes_requested", 500],
  ]);
});

test("a change request finds the client's version behind many staff-only saves", async () => {
  const t = makeTest();
  const invoiceId = await seedQuote(t);
  const line = { section: "fee" as const, label: "Photographer", quantity: 1 };

  await t.run(async (ctx) => {
    const revision = (number: number, kind: "approved" | "change_kept_approval", totalUsd: number) =>
      ctx.db.insert("invoiceRevisions", {
        invoiceId,
        number,
        kind,
        totalUsd,
        subtotalUsd: totalUsd,
        discountAmountUsd: 0,
        lines: [{ ...line, rateUsd: totalUsd, amountUsd: totalUsd }],
        createdAt: number,
      });
    await revision(1, "approved", 500);
    for (let number = 2; number <= 61; number++) await revision(number, "change_kept_approval", 600);
    const saved = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId_and_order", (q) => q.eq("invoiceId", invoiceId))
      .first();
    await ctx.db.patch(saved!._id, { rateUsd: 800, amountUsd: 800 });
  });
  await t.mutation(api.invoices.requestChangesByToken, { token: TOKEN, note: "Can we lower the price?" });

  const latest = await t.run(async (ctx) =>
    ctx.db
      .query("invoiceRevisions")
      .withIndex("by_invoiceId_and_number", (q) => q.eq("invoiceId", invoiceId))
      .order("desc")
      .first(),
  );
  expect([latest?.number, latest?.kind, latest?.totalUsd]).toEqual([62, "changes_requested", 500]);
});

async function sentEmails(t: Test, template: "quote_updated" | "booking_quote_ready") {
  return await t.run(async (ctx) =>
    (await ctx.db.query("emailNotifications").collect()).filter((row) => row.template === template),
  );
}

/** A request-portal quote managed by "Alex Manager", ready to send (or re-send) to the client. */
async function seedRequestPortalQuote(t: Test, extra: { alreadySent?: boolean } = {}) {
  const requestId = await seedRequest(t, { requestNumber: "ALREQ-SENDAS1" });
  const invoiceId = await seedInvoice(t, {
    invoiceNumber: "ALINV-SENDAS1",
    sourceEventRequestId: requestId,
  });
  await t.run(async (ctx) => {
    const now = Date.now();
    const termsId = await ctx.db.insert("invoiceTerms", {
      label: "Standard",
      version: "1",
      markdown: "Terms",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(requestId, { publicToken: "tok-send-as", submittedAt: now, linkedInvoiceId: invoiceId });
    await ctx.db.patch(invoiceId, {
      termsIds: [termsId],
      ...(extra.alreadySent ? { status: "finalized" as const, clientReviewReadyAt: now - 1000 } : {}),
    });
  });
  return invoiceId;
}

test("a quote sent to the client goes out as the person who clicked Send", async () => {
  const t = makeTest();
  const invoiceId = await seedRequestPortalQuote(t);
  const staff = await arborStaff(t);

  await staff.mutation(api.invoices.markReadyForClientReview, { id: invoiceId, clientMessage: "Here you go." });

  const [email] = await sentEmails(t, "booking_quote_ready");
  expect(email?.booking?.from).toBe('"Sam Staff at Arbor Live" <bookings@arbor.st>');
  expect(email?.payload).toMatchObject({ senderName: "Sam Staff", managerName: "Alex Manager" });
});

test("a quote sent as the manager is from the manager, and the history keeps the real sender", async () => {
  const t = makeTest();
  const invoiceId = await seedRequestPortalQuote(t);
  const staff = await arborStaff(t);

  await staff.mutation(api.invoices.markReadyForClientReview, {
    id: invoiceId,
    clientMessage: "Here you go.",
    sendAs: "manager",
  });

  const [email] = await sentEmails(t, "booking_quote_ready");
  expect(email?.booking?.from).toBe('"Alex Manager at Arbor Live" <bookings@arbor.st>');
  expect(email?.payload).toMatchObject({ senderName: "Alex Manager", managerName: "Alex Manager" });
  expect((await revisionsOf(t, invoiceId)).map((r) => [r.kind, r.actorName])).toEqual([["sent", "Sam Staff"]]);
});

test("a revised request-portal quote honors who it is sent as", async () => {
  const self = makeTest();
  const selfInvoice = await seedRequestPortalQuote(self, { alreadySent: true });
  await (await arborStaff(self)).mutation(api.invoices.sendRevisedQuote, { id: selfInvoice, message: "Updated." });
  expect((await sentEmails(self, "booking_quote_ready"))[0]?.booking?.from).toBe(
    '"Sam Staff at Arbor Live" <bookings@arbor.st>',
  );

  const asManager = makeTest();
  const managerInvoice = await seedRequestPortalQuote(asManager, { alreadySent: true });
  await (await arborStaff(asManager)).mutation(api.invoices.sendRevisedQuote, {
    id: managerInvoice,
    message: "Updated.",
    sendAs: "manager",
  });
  const [email] = await sentEmails(asManager, "booking_quote_ready");
  expect(email?.booking?.from).toBe('"Alex Manager at Arbor Live" <bookings@arbor.st>');
  expect(email?.payload).toMatchObject({ senderName: "Alex Manager" });
  expect((await revisionsOf(asManager, managerInvoice)).map((r) => r.actorName)).toEqual(["Sam Staff"]);
});

test("an emailed revised quote defaults to the sender and can go out as the manager", async () => {
  const t = makeTest();
  const staff = await arborStaff(t);
  const own = await seedQuote(t);
  await staff.mutation(api.invoices.sendRevisedQuote, { id: own, message: "Revised." });
  const covered = await seedQuote(t, { invoiceNumber: "ALINV-TESTCR2", publicApprovalToken: "other-token" });
  await staff.mutation(api.invoices.sendRevisedQuote, { id: covered, message: "Revised.", sendAs: "manager" });

  const emails = await sentEmails(t, "quote_updated");
  const byInvoice = new Map(emails.map((email) => [(email.payload as { invoiceNumber: string }).invoiceNumber, email]));
  const ownEmail = byInvoice.get("ALINV-TESTCR1");
  expect(ownEmail?.booking?.from).toBe('"Sam Staff at Arbor Live" <bookings@arbor.st>');
  expect(ownEmail?.payload).toMatchObject({ senderName: "Sam Staff", managerName: "Alex Manager" });
  const coveredEmail = byInvoice.get("ALINV-TESTCR2");
  expect(coveredEmail?.booking?.from).toBe('"Alex Manager at Arbor Live" <bookings@arbor.st>');
  expect(coveredEmail?.payload).toMatchObject({ senderName: "Alex Manager" });
  expect((await revisionsOf(t, covered)).map((r) => r.actorName)).toEqual(["Sam Staff"]);
});

test("sending as the manager is refused when the quote has no manager name, and nothing is recorded", async () => {
  const t = makeTest();
  const invoiceId = await seedQuote(t, { managerName: "  " });
  const staff = await arborStaff(t);

  await expect(
    staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Revised.", sendAs: "manager" }),
  ).rejects.toThrow(/SEND_AS_NO_MANAGER/);
  expect(await revisionsOf(t, invoiceId)).toEqual([]);
  expect(await sentEmails(t, "quote_updated")).toEqual([]);

  await staff.mutation(api.invoices.sendRevisedQuote, { id: invoiceId, message: "Revised." });
  expect((await sentEmails(t, "quote_updated"))[0]?.booking?.from).toBe(
    '"Sam Staff at Arbor Live" <bookings@arbor.st>',
  );
});
