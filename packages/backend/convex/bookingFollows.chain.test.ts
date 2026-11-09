// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { scheduleSchedulePublishedEmails } from "./email/triggers";
import { scheduleQuoteApprovedEmail } from "./email/quoteApprovedEmails";
import { replaceAdditionalInvoiceLinks } from "./lib/eventInvoiceLinks";
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

async function opsUser(t: Test, arbor: { organizationId: string }): Promise<TestUser> {
  const user = await createUser(t, { role: "member" });
  await addMembership(t, user._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, user._id, arbor.organizationId);
  await setVerticals(t, user._id, ["Operations"]);
  return user;
}

/** Request -> quote A -> event E, plus follow-up quote B attached to E as an additional invoice. */
async function seedBookingWithFollowUp() {
  const t = makeTest();
  const arbor = await createOrg(t, { type: "arbor_internal" });
  const ops = await opsUser(t, arbor);
  const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
  const invoiceA = await seedInvoice(t, { invoiceNumber: "ALINV-AAAAAAA", sourceEventRequestId: requestId });
  await t.run(async (ctx) => ctx.db.patch(requestId, { linkedInvoiceId: invoiceA }));
  const eventId = await seedEvent(t, { invoiceId: invoiceA, sourceEventRequestId: requestId });
  const invoiceB = await seedInvoice(t, { invoiceNumber: "ALINV-BBBBBBB" });
  await t.run(async (ctx) => replaceAdditionalInvoiceLinks(ctx, eventId, [invoiceB]));
  return { t, ops, requestId, invoiceA, invoiceB, eventId };
}

const request = (requestId: Id<"eventRequests">) => ({ kind: "request" as const, requestId });
const invoice = (invoiceId: Id<"invoices">) => ({ kind: "invoice" as const, invoiceId });
const event = (eventId: Id<"events">) => ({ kind: "event" as const, eventId });

describe("a follow-up quote attached to the booking's event", () => {
  it("is covered by a follow on the request, and its approval reaches the follower", async () => {
    const { t, ops, requestId, invoiceB, eventId } = await seedBookingWithFollowUp();
    const opsApi = asUser(t, ops);
    await opsApi.mutation(api.bookingFollows.follow, { target: request(requestId) });

    const shown = {
      event: await opsApi.query(api.bookingFollows.isFollowing, { target: event(eventId) }),
      followUpQuote: await opsApi.query(api.bookingFollows.isFollowing, { target: invoice(invoiceB) }),
    };
    await t.run(async (ctx) => {
      await scheduleQuoteApprovedEmail(ctx, { invoice: (await ctx.db.get(invoiceB))!, approvedAt: 1 });
    });
    const sentTo = (await t.run(async (ctx) => ctx.db.query("emailNotifications").collect()))
      .filter((row) => row.template === "quote_approved")
      .map((row) => row.to);
    expect(shown).toEqual({ event: true, followUpQuote: true });
    expect(sentTo).toEqual([ops.email]);
  });

  it("is followed with the rest of the booking, so unfollowing from the request stops it", async () => {
    const { t, ops, requestId, invoiceB } = await seedBookingWithFollowUp();
    const opsApi = asUser(t, ops);
    await opsApi.mutation(api.bookingFollows.follow, { target: invoice(invoiceB) });
    const requestShowsBefore = await opsApi.query(api.bookingFollows.isFollowing, { target: request(requestId) });
    await opsApi.mutation(api.bookingFollows.unfollow, { target: request(requestId) });

    const remaining = await t.run(async (ctx) => ctx.db.query("bookingFollows").collect());
    const followUpShowsAfter = await opsApi.query(api.bookingFollows.isFollowing, { target: invoice(invoiceB) });
    await t.run(async (ctx) => {
      await scheduleQuoteApprovedEmail(ctx, { invoice: (await ctx.db.get(invoiceB))!, approvedAt: 2 });
    });
    const sentTo = (await t.run(async (ctx) => ctx.db.query("emailNotifications").collect()))
      .filter((row) => row.template === "quote_approved")
      .map((row) => row.to);
    expect(requestShowsBefore).toBe(true);
    expect(remaining).toHaveLength(0);
    expect(sentTo).toEqual([]);
  });
});

describe("schedule published", () => {
  it("reaches a follower made event manager inside the debounce window once", async () => {
    const t = makeTest();
    const arbor = await createOrg(t, { type: "arbor_internal" });
    const ops = await opsUser(t, arbor);
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
    const invoiceId = await seedInvoice(t, { invoiceNumber: "ALINV-AAAAAAA", sourceEventRequestId: requestId });
    await t.run(async (ctx) => ctx.db.patch(requestId, { linkedInvoiceId: invoiceId }));
    const eventId = await seedEvent(t, { invoiceId, sourceEventRequestId: requestId });
    await asUser(t, ops).mutation(api.bookingFollows.follow, { target: event(eventId) });

    await t.run(async (ctx) => scheduleSchedulePublishedEmails(ctx, eventId, "fp1"));
    await t.run(async (ctx) => ctx.db.patch(eventId, { eventManagerUserId: ops._id }));
    await t.run(async (ctx) => scheduleSchedulePublishedEmails(ctx, eventId, "fp2"));

    const queued = (await t.run(async (ctx) => ctx.db.query("emailNotifications").collect()))
      .filter((row) => row.template === "schedule_published" && row.status === "queued")
      .map((row) => ({ to: row.to, debounceKey: row.debounceKey, idempotencyKey: row.idempotencyKey }));
    expect(queued).toHaveLength(1);
  });
});
