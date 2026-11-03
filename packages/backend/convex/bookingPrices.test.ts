// @vitest-environment edge-runtime
import { expect, test } from "vitest";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
  type Test,
} from "./test/setup.helpers";

/** An upcoming event with a band booked into a position, and the band's draft payout. */
async function bookedAct(t: Test, opts: { performerHourlyRateUsd?: number } = {}) {
  const band = await createOrg(t, { type: "band" });
  const now = Date.now();
  const ids = await t.run(async (ctx) => {
    if (opts.performerHourlyRateUsd !== undefined) {
      const profile = await ctx.db
        .query("organizationProfiles")
        .withIndex("by_organizationId", (q) => q.eq("organizationId", band.organizationId))
        .unique();
      await ctx.db.patch(profile!._id, {
        performerHourlyRateUsd: opts.performerHourlyRateUsd,
        bandMembers: ["A", "B", "C", "D", "E", "F"],
      });
    }
    const eventId = await ctx.db.insert("events", {
      title: "Booking price test",
      status: "ready",
      visibility: "internal",
      startAt: now + 86_400_000,
      endAt: now + 90_000_000,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      createdAt: now,
      updatedAt: now,
    });
    const needId = await ctx.db.insert("eventArtistNeeds", {
      eventId,
      label: "Headliner",
      status: "open",
      createdAt: now,
      updatedAt: now,
    });
    return { eventId, needId };
  });
  const staff = await arborStaff(t);
  await staff.mutation(api.eventBands.addParticipation, {
    eventId: ids.eventId,
    organizationId: band.organizationId,
    role: "headliner",
    needId: ids.needId,
  });
  const paymentId = await staff.mutation(api.bandPayments.upsertForEvent, {
    eventId: ids.eventId,
    organizationId: band.organizationId,
  });
  return { ...ids, band, staff, paymentId };
}

async function arborStaff(t: Test) {
  const staff = await createUser(t, { role: "admin", name: "Sam Staff" });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, staff._id, arbor.organizationId, "org_admin", true);
  await setActiveOrg(t, staff._id, arbor.organizationId);
  return asUser(t, staff);
}

async function quoteFor(
  t: Test,
  eventId: Id<"events">,
  extra: Partial<Doc<"invoices">> = {},
) {
  const now = Date.now();
  return await t.run(async (ctx) => {
    const invoiceId = await ctx.db.insert("invoices", {
      invoiceNumber: "ALINV-PRICE01",
      status: "draft",
      issueDate: "2026-10-01",
      managerUserId: "manager",
      managerName: "Alex Manager",
      equipmentPricingMode: "subsidized",
      crewRateMode: "normal",
      discountType: "amount",
      discountValue: 0,
      discountAmountUsd: 0,
      equipmentSubtotalUsd: 0,
      externalRentalsSubtotalUsd: 0,
      artistsSubtotalUsd: 0,
      crewSubtotalUsd: 0,
      feesSubtotalUsd: 0,
      subtotalUsd: 0,
      totalUsd: 0,
      clientApprovalStatus: "pending",
      createdAt: now,
      updatedAt: now,
      ...extra,
    });
    await ctx.db.patch(eventId, { invoiceId });
    return invoiceId;
  });
}

function saveQuote(
  staff: Awaited<ReturnType<typeof arborStaff>>,
  invoiceId: Id<"invoices">,
  line: {
    eventId: Id<"events">;
    needId: Id<"eventArtistNeeds">;
    organizationId: string;
    memberCount: number;
    performanceHours: number;
    rateUsd: number;
  },
) {
  return staff.mutation(api.invoices.updateDraft, {
    id: invoiceId,
    issueDate: "2026-10-01",
    managerUserId: "manager",
    managerName: "Alex Manager",
    equipmentPricingMode: "subsidized",
    crewRateMode: "normal",
    discountType: "amount",
    discountValue: 0,
    lineItems: [
      {
        section: "artist",
        order: 0,
        label: "The Band",
        quantity: line.memberCount * line.performanceHours,
        rateUsd: line.rateUsd,
        organizationId: line.organizationId,
        eventId: line.eventId,
        needId: line.needId,
        memberCount: line.memberCount,
        performanceHours: line.performanceHours,
      },
    ],
  });
}

const get = <T extends "events" | "eventArtistNeeds" | "eventBandPayments" | "invoices">(
  t: Test,
  id: Id<T>,
) => t.run(async (ctx) => (await ctx.db.get(id)) as Doc<T> | null);

test("a booked act starts from its profile rate, and its payout pays the booking", async () => {
  const t = makeTest();
  const { needId, paymentId, eventId } = await bookedAct(t, { performerHourlyRateUsd: 150 });

  expect((await get(t, needId))?.price).toMatchObject({ memberCount: 6, totalUsd: 900 });
  expect((await get(t, paymentId))?.totalUsd).toBe(900);
  expect((await get(t, eventId))?.bandsCostUsd).toBe(900);
});

test("the quote prices the booking: billed equals paid", async () => {
  const t = makeTest();
  const { needId, paymentId, eventId, band, staff } = await bookedAct(t, { performerHourlyRateUsd: 150 });
  const invoiceId = await quoteFor(t, eventId);

  await saveQuote(staff, invoiceId, {
    eventId,
    needId,
    organizationId: band.organizationId,
    memberCount: 5,
    performanceHours: 1,
    rateUsd: 90,
  });

  expect((await get(t, needId))?.price).toMatchObject({ memberCount: 5, ratePerMemberPerHourUsd: 90, totalUsd: 450 });
  expect((await get(t, paymentId))?.totalUsd).toBe(450);
  expect((await get(t, eventId))?.bandsCostUsd).toBe(450);
  expect((await get(t, invoiceId))?.artistsSubtotalUsd).toBe(450);
});

test("a Lineup price rebills a draft quote and moves the payout", async () => {
  const t = makeTest();
  const { needId, paymentId, eventId, band, staff } = await bookedAct(t);
  const invoiceId = await quoteFor(t, eventId);
  await saveQuote(staff, invoiceId, {
    eventId,
    needId,
    organizationId: band.organizationId,
    memberCount: 5,
    performanceHours: 1,
    rateUsd: 90,
  });

  await staff.mutation(api.eventArtistNeeds.setPrice, {
    needId,
    pricingMode: "fixed_total",
    totalUsd: 600,
  });

  const lines = await t.run(async (ctx) =>
    ctx.db
      .query("invoiceLineItems")
      .withIndex("by_needId", (q) => q.eq("needId", needId))
      .take(5),
  );
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ quantity: 1, rateUsd: 600, amountUsd: 600 });
  expect(lines[0]?.memberCount).toBeUndefined();
  expect((await get(t, invoiceId))?.totalUsd).toBe(600);
  expect((await get(t, paymentId))).toMatchObject({ pricingMode: "fixed_total", totalUsd: 600 });
  expect((await get(t, eventId))?.bandsCostUsd).toBe(600);
});

test("an approved or final quote is never changed from the Lineup", async () => {
  const t = makeTest();
  const { needId, eventId, band, staff, paymentId } = await bookedAct(t);
  const invoiceId = await quoteFor(t, eventId);
  await saveQuote(staff, invoiceId, {
    eventId,
    needId,
    organizationId: band.organizationId,
    memberCount: 5,
    performanceHours: 1,
    rateUsd: 90,
  });

  await t.run(async (ctx) => ctx.db.patch(invoiceId, { clientApprovalStatus: "approved", status: "finalized" }));
  await expect(
    staff.mutation(api.eventArtistNeeds.setPrice, { needId, pricingMode: "fixed_total", totalUsd: 900 }),
  ).rejects.toThrow(/approved ALINV-PRICE01.*quote editor/);

  await t.run(async (ctx) => ctx.db.patch(invoiceId, { billingFinalizedAt: Date.now() }));
  await expect(
    staff.mutation(api.eventArtistNeeds.setPrice, { needId, pricingMode: "fixed_total", totalUsd: 900 }),
  ).rejects.toThrow(/Reopen billing/);

  expect((await get(t, needId))?.price?.totalUsd).toBe(450);
  expect((await get(t, paymentId))?.totalUsd).toBe(450);
});

test("paid payouts are history; an event without a quote still pays the booking", async () => {
  const t = makeTest();
  const { needId, paymentId, eventId, staff } = await bookedAct(t);
  await staff.mutation(api.eventArtistNeeds.setPrice, {
    needId,
    pricingMode: "per_member_hourly",
    memberCount: 3,
    performanceHours: 2,
    ratePerMemberPerHourUsd: 50,
  });
  expect((await get(t, paymentId))?.totalUsd).toBe(300);

  await t.run(async (ctx) => ctx.db.patch(paymentId, { status: "paid" }));
  await staff.mutation(api.eventArtistNeeds.setPrice, { needId, pricingMode: "fixed_total", totalUsd: 1000 });
  expect((await get(t, paymentId))?.totalUsd).toBe(300);
  expect((await get(t, eventId))?.bandsCostUsd).toBe(300);
});

test("an older act with a payout but no position keeps its payout's price", async () => {
  const t = makeTest();
  const { band, staff } = await bookedAct(t, { performerHourlyRateUsd: 150 });
  const now = Date.now();
  const { eventId, paymentId } = await t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      title: "Before booking prices",
      status: "ready",
      visibility: "internal",
      startAt: now + 86_400_000,
      endAt: now + 90_000_000,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("eventBandParticipations", {
      eventId,
      organizationId: band.organizationId,
      role: "headliner",
      createdAt: now,
      updatedAt: now,
    });
    const paymentId = await ctx.db.insert("eventBandPayments", {
      eventId,
      organizationId: band.organizationId,
      pricingMode: "fixed_total",
      totalUsd: 250,
      status: "draft",
      confirmationToken: "legacy-token",
      createdAt: now,
      updatedAt: now,
    });
    return { eventId, paymentId };
  });

  await staff.mutation(api.bandPayments.upsertForEvent, { eventId, paymentId, organizationId: band.organizationId });

  expect((await get(t, paymentId))?.totalUsd).toBe(250);
  const act = await t.run(async (ctx) =>
    ctx.db
      .query("eventBandParticipations")
      .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
      .first(),
  );
  expect((await get(t, act!.needId!))?.price).toEqual({ pricingMode: "fixed_total", totalUsd: 250 });
});

test("a signed payout whose amount changes needs a new signature", async () => {
  const t = makeTest();
  const { needId, paymentId, staff } = await bookedAct(t);
  await staff.mutation(api.eventArtistNeeds.setPrice, { needId, pricingMode: "fixed_total", totalUsd: 400 });
  await t.run(async (ctx) =>
    ctx.db.patch(paymentId, {
      status: "confirmed",
      confirmedAt: Date.now(),
      confirmationEmailSentAt: Date.now(),
      signatureTypedName: "Payee",
    }),
  );

  await staff.mutation(api.eventArtistNeeds.setPrice, { needId, pricingMode: "fixed_total", totalUsd: 500 });

  const payment = await get(t, paymentId);
  expect(payment).toMatchObject({ status: "pending_email", totalUsd: 500 });
  expect(payment?.confirmedAt).toBeUndefined();
  expect(payment?.signatureTypedName).toBeUndefined();
});
