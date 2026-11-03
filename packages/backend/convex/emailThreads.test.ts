// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import {
  findThreadForBooking,
  getOrCreateThreadForBooking,
  resolveBookingRefs,
} from "./lib/emailThreads";
import { seedEvent, seedInvoice, seedRequest } from "./test/bookingSeeds.helpers";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
  type Test,
} from "./test/setup.helpers";

async function seedBooking(t: ReturnType<typeof makeTest>) {
  const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
  const invoiceId = await seedInvoice(t, {
    invoiceNumber: "ALINV-BBBBBBB",
    sourceEventRequestId: requestId,
  });
  await t.run(async (ctx) => ctx.db.patch(requestId, { linkedInvoiceId: invoiceId }));
  const eventId = await seedEvent(t, { invoiceId, sourceEventRequestId: requestId });
  return { requestId, invoiceId, eventId };
}

describe("resolveBookingRefs", () => {
  it("reaches the whole booking from the request, invoice or event", async () => {
    const t = makeTest();
    const ids = await seedBooking(t);
    for (const ref of [
      { requestId: ids.requestId },
      { invoiceId: ids.invoiceId },
      { eventId: ids.eventId },
    ]) {
      const refs = await t.run(async (ctx) => resolveBookingRefs(ctx, ref));
      expect(refs).toEqual(ids);
    }
  });

  it("follows event → invoice → request when the event has no direct request link", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-CCCCCCC" });
    const invoiceId = await seedInvoice(t, {
      invoiceNumber: "ALINV-DDDDDDD",
      sourceEventRequestId: requestId,
    });
    const eventId = await seedEvent(t, { invoiceId });
    const refs = await t.run(async (ctx) => resolveBookingRefs(ctx, { eventId }));
    expect(refs).toEqual({ requestId, invoiceId, eventId });
  });

  it("returns only what exists for a standalone event", async () => {
    const t = makeTest();
    const eventId = await seedEvent(t);
    const refs = await t.run(async (ctx) => resolveBookingRefs(ctx, { eventId }));
    expect(refs).toEqual({ requestId: undefined, invoiceId: undefined, eventId });
  });
});

describe("getOrCreateThreadForBooking", () => {
  it("converges on one thread whichever record is the entry point", async () => {
    const t = makeTest();
    const ids = await seedBooking(t);
    const created = await t.run(async (ctx) =>
      getOrCreateThreadForBooking(ctx, { requestId: ids.requestId }),
    );
    const fromInvoice = await t.run(async (ctx) =>
      getOrCreateThreadForBooking(ctx, { invoiceId: ids.invoiceId }),
    );
    const fromEvent = await t.run(async (ctx) =>
      getOrCreateThreadForBooking(ctx, { eventId: ids.eventId }),
    );
    expect(fromInvoice._id).toBe(created._id);
    expect(fromEvent._id).toBe(created._id);
    const rows = await t.run(async (ctx) => ctx.db.query("emailThreads").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject(ids);
  });

  it("patches in ids that became known after the thread was created", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-EEEEEEE" });
    const first = await t.run(async (ctx) => getOrCreateThreadForBooking(ctx, { requestId }));
    expect(first.invoiceId).toBeUndefined();

    const invoiceId = await seedInvoice(t, {
      invoiceNumber: "ALINV-FFFFFFF",
      sourceEventRequestId: requestId,
    });
    const second = await t.run(async (ctx) => getOrCreateThreadForBooking(ctx, { invoiceId }));
    expect(second._id).toBe(first._id);
    expect(second.invoiceId).toBe(invoiceId);

    const stored = await t.run(async (ctx) => ctx.db.get(first._id));
    expect(stored).toMatchObject({ requestId, invoiceId });
  });

  it("findThreadForBooking returns null before any thread exists", async () => {
    const t = makeTest();
    const ids = await seedBooking(t);
    const found = await t.run(async (ctx) => findThreadForBooking(ctx, ids));
    expect(found).toBeNull();
  });
});

async function staffViewer(t: Test) {
  const user = await createUser(t, { email: "staff@arbor.st" });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, user._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, user._id, arbor.organizationId);
  return asUser(t, user);
}

describe("emailThreads.getForRecord", () => {
  function received(overrides: Record<string, unknown> = {}) {
    return {
      resendEmailId: "re_1",
      messageId: "m1@client.test",
      references: [],
      fromEmail: "maya@client.test",
      fromName: "Maya Rivera",
      to: ["alreq-aaaaaaa@arbor.st"],
      cc: [],
      receivedFor: [],
      subject: "Re: Your quote",
      text: "Sounds good!\n\nOn Mon, Nov 3, 2026 at 9:00 AM Arbor <n@arbor.st> wrote:\n> quote",
      attachments: [{ filename: "po.pdf", contentType: "application/pdf", size: 10 }],
      receivedAt: Date.UTC(2026, 10, 3, 18),
      ...overrides,
    };
  }

  it("shows the same conversation on the request, invoice and event", async () => {
    const t = makeTest();
    const ids = await seedBooking(t);
    await t.mutation(internal.emailInbound.recordInboundEmail, received());
    await t.mutation(
      internal.emailInbound.recordInboundEmail,
      received({
        resendEmailId: "re_2",
        messageId: "m2@arbor.test",
        fromEmail: "alex@arbor.st",
        fromName: "Alex",
        to: ["maya@client.test"],
        cc: ["alinv-bbbbbbb@arbor.st"],
        text: "Thanks Maya",
        attachments: [],
        receivedAt: Date.UTC(2026, 10, 3, 19),
      }),
    );
    const staff = await staffViewer(t);

    const fromRequest = await staff.query(api.emailThreads.getForRecord, { requestId: ids.requestId });
    const fromInvoice = await staff.query(api.emailThreads.getForRecord, { invoiceId: ids.invoiceId });
    const fromEvent = await staff.query(api.emailThreads.getForRecord, { eventId: ids.eventId });

    expect(fromRequest.address).toBe("alreq-aaaaaaa@arbor.st");
    expect(fromInvoice.address).toBe("alinv-bbbbbbb@arbor.st");
    expect(fromEvent.address).toBe(`alevt-${ids.eventId}@arbor.st`);
    for (const result of [fromRequest, fromInvoice, fromEvent]) {
      expect(result.thread).toEqual({ id: fromRequest.thread!.id, messageCount: 2 });
      expect(result.messages.map((m) => m.bodyText)).toEqual(["Sounds good!", "Thanks Maya"]);
    }
    expect(fromRequest.messages[0]).toMatchObject({
      fromClient: true,
      matchedBy: "address",
      attachments: [{ filename: "po.pdf" }],
    });
    expect(fromRequest.messages[1]).toMatchObject({ fromClient: false, matchedBy: "address" });
  });

  it("returns the address and an empty conversation without creating a thread", async () => {
    const t = makeTest();
    const ids = await seedBooking(t);
    const staff = await staffViewer(t);
    const result = await staff.query(api.emailThreads.getForRecord, { requestId: ids.requestId });
    expect(result).toEqual({ address: "alreq-aaaaaaa@arbor.st", thread: null, messages: [] });
    expect(await t.run(async (ctx) => ctx.db.query("emailThreads").collect())).toHaveLength(0);
  });

  it("has no address for a legacy request without a number", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t);
    const staff = await staffViewer(t);
    const result = await staff.query(api.emailThreads.getForRecord, { requestId });
    expect(result.address).toBeNull();
  });

  it("returns the newest 100 messages oldest-first", async () => {
    const t = makeTest();
    const ids = await seedBooking(t);
    for (let i = 0; i < 105; i += 1) {
      await t.mutation(
        internal.emailInbound.recordInboundEmail,
        received({
          resendEmailId: `re_${i}`,
          messageId: `m${i}@client.test`,
          text: `message ${i}`,
          receivedAt: Date.UTC(2026, 10, 3, 18) + i * 1000,
        }),
      );
    }
    const staff = await staffViewer(t);
    const result = await staff.query(api.emailThreads.getForRecord, { requestId: ids.requestId });
    expect(result.thread?.messageCount).toBe(105);
    expect(result.messages).toHaveLength(100);
    expect(result.messages[0]!.bodyText).toBe("message 5");
    expect(result.messages[99]!.bodyText).toBe("message 104");
  });

  it("rejects callers who are signed out or outside Arbor Live", async () => {
    const t = makeTest();
    const ids = await seedBooking(t);
    await expect(t.query(api.emailThreads.getForRecord, { requestId: ids.requestId })).rejects.toThrow();

    const band = await createUser(t, { email: "band@example.com" });
    const bandOrg = await createOrg(t, { type: "band" });
    await addMembership(t, band._id, bandOrg.organizationId, "member", true);
    await setActiveOrg(t, band._id, bandOrg.organizationId);
    await expect(
      asUser(t, band).query(api.emailThreads.getForRecord, { requestId: ids.requestId }),
    ).rejects.toThrow();
  });

  it("requires exactly one record id", async () => {
    const t = makeTest();
    const ids = await seedBooking(t);
    const staff = await staffViewer(t);
    await expect(staff.query(api.emailThreads.getForRecord, {})).rejects.toThrow(/exactly one/);
    await expect(
      staff.query(api.emailThreads.getForRecord, { requestId: ids.requestId, invoiceId: ids.invoiceId }),
    ).rejects.toThrow(/exactly one/);
  });
});
