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

    expect([fromRequest.address, fromInvoice.address, fromEvent.address]).toEqual([
      "alreq-aaaaaaa@arbor.st",
      "alreq-aaaaaaa@arbor.st",
      "alreq-aaaaaaa@arbor.st",
    ]);
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
    expect(result).toEqual({
      address: "alreq-aaaaaaa@arbor.st",
      clientEmail: "maya@client.test",
      canAttachQuote: true,
      thread: null,
      messages: [],
    });
    expect(await t.run(async (ctx) => ctx.db.query("emailThreads").collect())).toHaveLength(0);
  });

  it("falls back to the invoice, then the event, for the booking address", async () => {
    const t = makeTest();
    const invoiceId = await seedInvoice(t, { invoiceNumber: "ALINV-CCCCCCC" });
    const eventId = await seedEvent(t, { invoiceId });
    const loneEventId = await seedEvent(t, {});
    const staff = await staffViewer(t);
    const fromEvent = await staff.query(api.emailThreads.getForRecord, { eventId });
    const fromLoneEvent = await staff.query(api.emailThreads.getForRecord, { eventId: loneEventId });
    expect(fromEvent.address).toBe("alinv-ccccccc@arbor.st");
    expect(fromLoneEvent.address).toBe(`alevt-${loneEventId}@arbor.st`);
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

/** A booking whose quote the client is reviewing, with one emailed reply from the client. */
async function seedReviewedBooking(t: ReturnType<typeof makeTest>, overrides: { fromEmail?: string } = {}) {
  const ids = await seedBooking(t);
  await t.run(async (ctx) => {
    await ctx.db.patch(ids.invoiceId, {
      status: "finalized",
      clientReviewReadyAt: Date.UTC(2026, 10, 3, 17),
      clientApprovalStatus: "pending",
      clientContactName: "Maya Rivera",
    });
    await ctx.db.patch(ids.requestId, { publicToken: "tok-request", eventName: "Winter Gala" });
  });
  await t.mutation(internal.emailInbound.recordInboundEmail, {
    resendEmailId: "re_client_1",
    messageId: "client-1@client.test",
    references: [],
    fromEmail: overrides.fromEmail ?? "Maya@Client.test",
    fromName: "Maya Rivera",
    to: ["alreq-aaaaaaa@arbor.st"],
    cc: [],
    receivedFor: [],
    subject: "Re: Your quote",
    text: "Can we swap the wireless mics for wired?",
    attachments: [],
    receivedAt: Date.UTC(2026, 10, 3, 18),
  });
  const messages = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
  return { ...ids, messageId: messages[0]!._id };
}

async function namedStaff(t: Test, name: string) {
  const user = await createUser(t, { email: "alex@arbor.st", name });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, user._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, user._id, arbor.organizationId);
  return { staff: asUser(t, user), user };
}

describe("emailThreads.sendReply", () => {
  it("queues a booking_reply from the signed-in staff member on the booking thread", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const { staff } = await namedStaff(t, "Jamie Park");

    await staff.mutation(api.emailThreads.sendReply, {
      invoiceId: ids.invoiceId,
      body: "  Yes, wired mics work.\n\nI will update the quote.  ",
      attachQuote: true,
      cc: ["Colleague@Arbor.st", "colleague@arbor.st", "maya@client.test"],
      clientRequestId: "attempt-1",
    });

    const rows = await t.run(async (ctx) =>
      (await ctx.db.query("emailNotifications").collect()).filter((n) => n.template === "booking_reply"),
    );
    const thread = await t.run(async (ctx) => (await ctx.db.query("emailThreads").collect())[0]!);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      to: "maya@client.test",
      cc: ["colleague@arbor.st"],
      subject: "Re: Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)",
      replyTo: ["alreq-aaaaaaa@arbor.st"],
      booking: { threadId: thread._id, from: '"Jamie Park at Arbor Live" <bookings@arbor.st>' },
      idempotencyKey: `booking_reply:${thread._id}:attempt-1`,
      status: "queued",
    });
    expect(rows[0]!.payload).toEqual({
      body: "Yes, wired mics work.\n\nI will update the quote.",
      senderName: "Jamie Park",
      portalUrl: "http://localhost:3000/request/track/tok-request",
      portalLabel: "Open your request tracker",
      attachQuote: true,
      invoiceId: ids.invoiceId,
      invoiceNumber: "ALINV-BBBBBBB",
    });
  });

  it("does not queue the same clientRequestId twice", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const { staff } = await namedStaff(t, "Jamie Park");
    const reply = {
      requestId: ids.requestId,
      body: "On it.",
      attachQuote: false,
      clientRequestId: "attempt-1",
    };
    await staff.mutation(api.emailThreads.sendReply, reply);
    await staff.mutation(api.emailThreads.sendReply, reply);
    await staff.mutation(api.emailThreads.sendReply, { ...reply, clientRequestId: "attempt-2" });

    const rows = await t.run(async (ctx) =>
      (await ctx.db.query("emailNotifications").collect()).filter((n) => n.template === "booking_reply"),
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => !("attachQuote" in (row.payload as object)))).toBe(true);
  });

  it("refuses callers outside Arbor Live", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const reply = { requestId: ids.requestId, body: "Hi", attachQuote: false, clientRequestId: "a" };
    await expect(t.mutation(api.emailThreads.sendReply, reply)).rejects.toThrow();

    const band = await createUser(t, { email: "band@example.com" });
    const bandOrg = await createOrg(t, { type: "band" });
    await addMembership(t, band._id, bandOrg.organizationId, "member", true);
    await setActiveOrg(t, band._id, bandOrg.organizationId);
    await expect(asUser(t, band).mutation(api.emailThreads.sendReply, reply)).rejects.toThrow();
    expect(await t.run(async (ctx) => ctx.db.query("emailNotifications").collect())).toHaveLength(0);
  });

  it("refuses an invalid CC address, an empty body and a missing quote", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const { staff } = await namedStaff(t, "Jamie Park");
    const base = { requestId: ids.requestId, body: "Hi", attachQuote: false, clientRequestId: "a" };

    await expect(
      staff.mutation(api.emailThreads.sendReply, { ...base, cc: ["not-an-email"] }),
    ).rejects.toThrow(/EMAIL_REPLY_BAD_CC/);
    await expect(
      staff.mutation(api.emailThreads.sendReply, { ...base, cc: ["a <b@c.com>"] }),
    ).rejects.toThrow(/EMAIL_REPLY_BAD_CC/);
    await expect(
      staff.mutation(api.emailThreads.sendReply, {
        ...base,
        cc: Array.from({ length: 11 }, (_, i) => `person${i}@arbor.st`),
      }),
    ).rejects.toThrow(/At most 10 CC addresses, got 11/);
    await expect(staff.mutation(api.emailThreads.sendReply, { ...base, body: "  " })).rejects.toThrow(
      /Write a message/,
    );
    await t.run(async (ctx) => ctx.db.patch(ids.invoiceId, { status: "void" }));
    await expect(
      staff.mutation(api.emailThreads.sendReply, { ...base, attachQuote: true }),
    ).rejects.toThrow(/no quote to attach/);
    expect(
      (await t.run(async (ctx) => ctx.db.query("emailNotifications").collect())).filter(
        (n) => n.template === "booking_reply",
      ),
    ).toHaveLength(0);
  });

  it("replies from a request with no invoice, and errors when there is no client email", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-QQQQQQQ" });
    const { staff } = await namedStaff(t, "Jamie Park");
    await staff.mutation(api.emailThreads.sendReply, {
      requestId,
      body: "Hello",
      attachQuote: false,
      clientRequestId: "a",
    });
    const [row] = await t.run(async (ctx) => ctx.db.query("emailNotifications").collect());
    expect(row).toMatchObject({
      to: "maya@client.test",
      booking: { threadId: expect.any(String), from: '"Jamie Park at Arbor Live" <bookings@arbor.st>' },
      subject: "Arbor Live booking: Your event (ALREQ-QQQQQQQ)",
    });

    const invoiceId = await seedInvoice(t, { invoiceNumber: "ALINV-ZZZZZZZ" });
    await t.run(async (ctx) => ctx.db.patch(invoiceId, { clientEmail: undefined }));
    await expect(
      staff.mutation(api.emailThreads.sendReply, {
        invoiceId,
        body: "Hello",
        attachQuote: false,
        clientRequestId: "b",
      }),
    ).rejects.toThrow(/no client email/);
  });
});

describe("emailThreads.makeChangeRequest", () => {
  it("files the client's message as the quote change request and stamps it", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const { staff, user } = await namedStaff(t, "Jamie Park");

    await staff.mutation(api.emailThreads.makeChangeRequest, { messageId: ids.messageId });

    const invoice = await t.run(async (ctx) => ctx.db.get(ids.invoiceId));
    expect(invoice).toMatchObject({
      clientApprovalStatus: "changes_requested",
      clientApprovalNote: "Can we swap the wireless mics for wired?",
    });
    const message = await t.run(async (ctx) => ctx.db.get(ids.messageId));
    expect(message?.changeRequestedAt).toEqual(expect.any(Number));
    expect(message?.changeRequestedByUserId).toBe(user._id);
    const revisions = await t.run(async (ctx) => ctx.db.query("invoiceRevisions").collect());
    expect(revisions.map((r) => [r.kind, r.note])).toEqual([
      ["changes_requested", "Can we swap the wireless mics for wired?"],
    ]);

    await expect(
      staff.mutation(api.emailThreads.makeChangeRequest, { messageId: ids.messageId }),
    ).rejects.toThrow(/already a change request/);
  });

  it("refuses a sender who is not the client", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t, { fromEmail: "someone.else@client.test" });
    const { staff } = await namedStaff(t, "Jamie Park");
    await expect(
      staff.mutation(api.emailThreads.makeChangeRequest, { messageId: ids.messageId }),
    ).rejects.toThrow(/not from the booking's client/);
  });

  it("refuses an outbound message", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const { staff } = await namedStaff(t, "Jamie Park");
    const outboundId = await t.run(async (ctx) => {
      const inbound = (await ctx.db.get(ids.messageId))!;
      return ctx.db.insert("emailMessages", {
        ...Object.fromEntries(Object.entries(inbound).filter(([key]) => !key.startsWith("_"))),
        direction: "outbound",
        resendEmailId: "re_out_1",
        fromEmail: "maya@client.test",
      } as never);
    });
    await expect(
      staff.mutation(api.emailThreads.makeChangeRequest, { messageId: outboundId }),
    ).rejects.toThrow(/Only a client's reply/);
  });

  it("refuses when the quote is not waiting on the client", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const { staff } = await namedStaff(t, "Jamie Park");

    await t.run(async (ctx) => ctx.db.patch(ids.invoiceId, { clientReviewReadyAt: undefined }));
    await expect(
      staff.mutation(api.emailThreads.makeChangeRequest, { messageId: ids.messageId }),
    ).rejects.toThrow(/not been sent to the client/);

    await t.run(async (ctx) =>
      ctx.db.patch(ids.invoiceId, {
        clientReviewReadyAt: Date.UTC(2026, 10, 3, 17),
        clientApprovalStatus: "approved",
      }),
    );
    await expect(
      staff.mutation(api.emailThreads.makeChangeRequest, { messageId: ids.messageId }),
    ).rejects.toThrow(/already decided/);

    await t.run(async (ctx) => ctx.db.patch(ids.invoiceId, { status: "void" }));
    await expect(
      staff.mutation(api.emailThreads.makeChangeRequest, { messageId: ids.messageId }),
    ).rejects.toThrow(/no quote to change/);
    expect((await t.run(async (ctx) => ctx.db.get(ids.messageId)))?.changeRequestedAt).toBeUndefined();
  });

  it("refuses callers outside Arbor Live", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    await expect(
      t.mutation(api.emailThreads.makeChangeRequest, { messageId: ids.messageId }),
    ).rejects.toThrow();
    const band = await createUser(t, { email: "band@example.com" });
    const bandOrg = await createOrg(t, { type: "band" });
    await addMembership(t, band._id, bandOrg.organizationId, "member", true);
    await setActiveOrg(t, band._id, bandOrg.organizationId);
    await expect(
      asUser(t, band).mutation(api.emailThreads.makeChangeRequest, { messageId: ids.messageId }),
    ).rejects.toThrow();
    expect((await t.run(async (ctx) => ctx.db.get(ids.invoiceId)))?.clientApprovalStatus).toBe("pending");
  });
});

describe("emailThreads.getForRecord reply affordances", () => {
  it("flags the client's message as convertible only while the quote awaits their decision", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const { staff } = await namedStaff(t, "Jamie Park");
    const flags = async () => {
      const result = await staff.query(api.emailThreads.getForRecord, { eventId: ids.eventId });
      return {
        clientEmail: result.clientEmail,
        canAttachQuote: result.canAttachQuote,
        messages: result.messages.map((m) => [m.canMakeChangeRequest, m.changeRequestedAt ?? null]),
      };
    };

    expect(await flags()).toEqual({
      clientEmail: "maya@client.test",
      canAttachQuote: true,
      messages: [[true, null]],
    });

    await t.run(async (ctx) => ctx.db.patch(ids.invoiceId, { clientReviewReadyAt: undefined }));
    expect((await flags()).messages).toEqual([[false, null]]);

    await t.run(async (ctx) => ctx.db.patch(ids.invoiceId, { clientReviewReadyAt: 1 }));
    await staff.mutation(api.emailThreads.makeChangeRequest, { messageId: ids.messageId });
    const after = await flags();
    expect(after.messages).toEqual([[false, expect.any(Number)]]);

    await t.run(async (ctx) => ctx.db.patch(ids.invoiceId, { status: "void" }));
    expect((await flags()).canAttachQuote).toBe(false);
  });

  it("offers no change request on outbound or non-client messages", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t, { fromEmail: "cc.person@client.test" });
    const { staff } = await namedStaff(t, "Jamie Park");
    const result = await staff.query(api.emailThreads.getForRecord, { requestId: ids.requestId });
    expect(result.messages.map((m) => [m.fromClient, m.canMakeChangeRequest])).toEqual([[false, false]]);
  });
});
