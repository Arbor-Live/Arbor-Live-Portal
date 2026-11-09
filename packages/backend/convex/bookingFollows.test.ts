// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { scheduleEventCancelledEmails, scheduleSchedulePublishedEmails } from "./email/triggers";
import { scheduleQuoteApprovedEmail } from "./email/quoteApprovedEmails";
import { seedEvent, seedInvoice, seedRequest } from "./test/bookingSeeds.helpers";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
  setVerticals,
  type Test,
  type TestUser,
} from "./test/setup.helpers";

async function arborStaff(
  t: Test,
  arbor: { organizationId: string },
  kind: "admin" | "operations" | "crew",
): Promise<TestUser> {
  const user = await createUser(t, { role: kind === "admin" ? "admin" : "member" });
  await addMembership(t, user._id, arbor.organizationId, kind === "admin" ? "org_admin" : "member", true);
  await setActiveOrg(t, user._id, arbor.organizationId);
  if (kind !== "admin") await setVerticals(t, user._id, [kind === "crew" ? "Crew" : "Operations"]);
  return user;
}

async function world() {
  const t = makeTest();
  const arbor = await createOrg(t, { type: "arbor_internal" });
  return {
    t,
    ops: await arborStaff(t, arbor, "operations"),
    admin: await arborStaff(t, arbor, "admin"),
    crew: await arborStaff(t, arbor, "crew"),
  };
}

/** A request, its quote and the event, linked the way a converted booking is. */
async function seedBooking(t: Test, manager?: TestUser) {
  const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
  const invoiceId = await seedInvoice(t, {
    invoiceNumber: "ALINV-BBBBBBB",
    sourceEventRequestId: requestId,
    managerUserId: manager?._id,
  });
  await t.run(async (ctx) => {
    await ctx.db.patch(requestId, { linkedInvoiceId: invoiceId });
    if (manager) await ctx.db.patch(invoiceId, { managerEmail: manager.email, managerName: manager.name });
  });
  const eventId = await seedEvent(t, { invoiceId, sourceEventRequestId: requestId });
  return { requestId, invoiceId, eventId };
}

const request = (requestId: Id<"eventRequests">) => ({ kind: "request" as const, requestId });
const invoice = (invoiceId: Id<"invoices">) => ({ kind: "invoice" as const, invoiceId });
const event = (eventId: Id<"events">) => ({ kind: "event" as const, eventId });

function clientReply(resendEmailId = "re_1") {
  return {
    resendEmailId,
    messageId: `${resendEmailId}@client.test`,
    references: [],
    fromEmail: "maya@client.test",
    fromName: "Maya Rivera",
    to: ["alreq-aaaaaaa@arbor.st"],
    cc: [],
    receivedFor: ["alreq-aaaaaaa@arbor.st"],
    subject: "Re: Your quote",
    text: "Sounds good!",
    attachments: [],
    receivedAt: Date.UTC(2026, 10, 3, 18),
  };
}

const bellRows = (t: Test, userId: string) =>
  t.run(async (ctx) =>
    ctx.db
      .query("notifications")
      .withIndex("by_userId_and_dedupeKey", (q) => q.eq("userId", userId))
      .collect(),
  );
const emailRows = (t: Test, template: string) =>
  t.run(async (ctx) =>
    (await ctx.db.query("emailNotifications").collect()).filter((row) => row.template === template),
  );

describe("following", () => {
  it("follows and unfollows, and refuses crew", async () => {
    const { t, ops, crew } = await world();
    const { requestId } = await seedBooking(t);
    const opsApi = asUser(t, ops);

    expect(await opsApi.query(api.bookingFollows.isFollowing, { target: request(requestId) })).toBe(false);
    await opsApi.mutation(api.bookingFollows.follow, { target: request(requestId) });
    expect(await opsApi.query(api.bookingFollows.isFollowing, { target: request(requestId) })).toBe(true);
    await opsApi.mutation(api.bookingFollows.unfollow, { target: request(requestId) });
    expect(await opsApi.query(api.bookingFollows.isFollowing, { target: request(requestId) })).toBe(false);

    const crewApi = asUser(t, crew);
    await expect(
      crewApi.mutation(api.bookingFollows.follow, { target: request(requestId) }),
    ).rejects.toThrow();
    expect(await crewApi.query(api.bookingFollows.isFollowing, { target: request(requestId) })).toBeNull();
    expect(await t.query(api.bookingFollows.isFollowing, { target: request(requestId) })).toBeNull();
    expect(await t.run(async (ctx) => ctx.db.query("bookingFollows").collect())).toHaveLength(0);
  });

  it("covers the whole booking and unfollowing from the event clears it", async () => {
    const { t, ops, admin } = await world();
    const { requestId, invoiceId, eventId } = await seedBooking(t);
    const opsApi = asUser(t, ops);

    await opsApi.mutation(api.bookingFollows.follow, { target: request(requestId) });
    for (const target of [invoice(invoiceId), event(eventId)]) {
      expect(await opsApi.query(api.bookingFollows.isFollowing, { target })).toBe(true);
    }
    expect(await asUser(t, admin).query(api.bookingFollows.isFollowing, { target: event(eventId) })).toBe(false);

    await opsApi.mutation(api.bookingFollows.follow, { target: event(eventId) });
    expect(await t.run(async (ctx) => ctx.db.query("bookingFollows").collect())).toHaveLength(1);

    await opsApi.mutation(api.bookingFollows.unfollow, { target: event(eventId) });
    for (const target of [request(requestId), invoice(invoiceId), event(eventId)]) {
      expect(await opsApi.query(api.bookingFollows.isFollowing, { target })).toBe(false);
    }
    expect(await t.run(async (ctx) => ctx.db.query("bookingFollows").collect())).toHaveLength(0);
  });
});

describe("what followers get", () => {
  it("sends quote approved by email and in-app, and a client reply in-app", async () => {
    const { t, ops, admin } = await world();
    const { requestId, invoiceId } = await seedBooking(t, admin);
    await asUser(t, ops).mutation(api.bookingFollows.follow, { target: request(requestId) });

    await t.run(async (ctx) => {
      await scheduleQuoteApprovedEmail(ctx, { invoice: (await ctx.db.get(invoiceId))!, approvedAt: 1 });
    });
    const approved = await emailRows(t, "quote_approved");
    expect(approved.map((row) => row.to).sort()).toEqual([admin.email, ops.email].sort());
    expect(approved.find((row) => row.to === ops.email)!.idempotencyKey).toBe(
      `quote_approved:${invoiceId}:1:follower:${ops._id}`,
    );
    expect(await bellRows(t, ops._id)).toMatchObject([{ template: "quote_approved" }]);

    expect(await t.mutation(internal.emailInbound.recordInboundEmail, clientReply())).toBe("matched");
    const bells = await bellRows(t, ops._id);
    expect(bells.map((row) => row.template).sort()).toEqual(["booking_email_received", "quote_approved"]);
    expect(bells.find((row) => row.template === "booking_email_received")!.title).toBe(
      "Reply from Maya Rivera",
    );
  });

  it("sends a follower who is also the manager one copy", async () => {
    const { t, ops } = await world();
    const { requestId, invoiceId } = await seedBooking(t, ops);
    await asUser(t, ops).mutation(api.bookingFollows.follow, { target: request(requestId) });

    await t.run(async (ctx) => {
      await scheduleQuoteApprovedEmail(ctx, { invoice: (await ctx.db.get(invoiceId))!, approvedAt: 1 });
    });
    await t.mutation(internal.emailInbound.recordInboundEmail, clientReply());

    expect(await emailRows(t, "quote_approved")).toHaveLength(1);
    const bells = await bellRows(t, ops._id);
    expect(bells.filter((row) => row.template === "quote_approved")).toHaveLength(1);
    expect(bells.filter((row) => row.template === "booking_email_received")).toHaveLength(1);
  });

  it("sends nothing to a follower who lost staff access", async () => {
    const { t, ops, admin } = await world();
    const { requestId, invoiceId } = await seedBooking(t, admin);
    await asUser(t, ops).mutation(api.bookingFollows.follow, { target: request(requestId) });
    await setVerticals(t, ops._id, ["Crew"]);

    await t.run(async (ctx) => {
      await scheduleQuoteApprovedEmail(ctx, { invoice: (await ctx.db.get(invoiceId))!, approvedAt: 1 });
    });
    await t.mutation(internal.emailInbound.recordInboundEmail, clientReply());

    expect((await emailRows(t, "quote_approved")).map((row) => row.to)).toEqual([admin.email]);
    expect(await bellRows(t, ops._id)).toEqual([]);
  });

  it("respects a follower's email opt-out for the template", async () => {
    const { t, ops, admin } = await world();
    const { requestId, invoiceId } = await seedBooking(t, ops);
    await asUser(t, admin).mutation(api.bookingFollows.follow, { target: request(requestId) });
    await t.run(async (ctx) => {
      const profile = await ctx.db
        .query("userAdminProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", admin._id))
        .unique();
      const fields = { emailOptOuts: ["quote_approved"] };
      if (profile) await ctx.db.patch(profile._id, fields);
      else {
        await ctx.db.insert("userAdminProfiles", {
          userId: admin._id,
          verticals: [],
          createdAt: 1,
          updatedAt: 1,
          ...fields,
        });
      }
    });

    await t.run(async (ctx) => {
      await scheduleQuoteApprovedEmail(ctx, { invoice: (await ctx.db.get(invoiceId))!, approvedAt: 1 });
    });

    expect((await emailRows(t, "quote_approved")).map((row) => row.to)).toEqual([ops.email]);
    expect(await bellRows(t, admin._id)).toMatchObject([{ template: "quote_approved" }]);
  });

  it("sends event cancelled and schedule published once per person", async () => {
    const { t, ops, admin } = await world();
    const { requestId, eventId } = await seedBooking(t);
    await t.run(async (ctx) => ctx.db.patch(eventId, { eventManagerUserId: ops._id }));
    await asUser(t, ops).mutation(api.bookingFollows.follow, { target: request(requestId) });
    await asUser(t, admin).mutation(api.bookingFollows.follow, { target: request(requestId) });

    await t.run(async (ctx) => {
      await scheduleEventCancelledEmails(ctx, eventId, 5);
      await scheduleSchedulePublishedEmails(ctx, eventId, "fp1");
    });

    for (const template of ["event_cancelled", "schedule_published"]) {
      const rows = await emailRows(t, template);
      expect(rows.map((row) => row.to).sort()).toEqual([admin.email, ops.email].sort());
      expect(rows.find((row) => row.to === admin.email)!.idempotencyKey).toContain(
        `:follower:${admin._id}`,
      );
    }
  });
});
