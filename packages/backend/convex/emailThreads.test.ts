// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { api, internal } from "./_generated/api";
import {
  findThreadForBooking,
  getOrCreateThreadForBooking,
  resolveBookingRefs,
  truncateOnWord,
} from "./lib/emailThreads";
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
  await setVerticals(t, user._id, ["Operations"]);
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
      canReply: true,
      thread: null,
      messages: [],
      failedReplies: [],
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
async function seedReviewedBooking(
  t: ReturnType<typeof makeTest>,
  overrides: { fromEmail?: string; text?: string } = {},
) {
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
    text: overrides.text ?? "Can we swap the wireless mics for wired?",
    attachments: [],
    receivedAt: Date.UTC(2026, 10, 3, 18),
  });
  const messages = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
  return { ...ids, messageId: messages[0]!._id };
}

/** An Operations member of Arbor Live: allowed to email clients. */
async function namedStaff(t: Test, name: string) {
  const user = await createUser(t, { email: "alex@arbor.st", name });
  const arbor = await createOrg(t, { type: "arbor_internal" });
  await addMembership(t, user._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, user._id, arbor.organizationId);
  await setVerticals(t, user._id, ["Operations"]);
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

/** Arbor Live members in the three roles that matter to client email. */
async function viewersByRole(t: Test) {
  const arbor = await createOrg(t, { type: "arbor_internal" });
  const bandOrg = await createOrg(t, { type: "band" });

  const plain = await createUser(t, { email: "plain@arbor.st", name: "Plain Member" });
  await addMembership(t, plain._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, plain._id, arbor.organizationId);

  const crew = await createUser(t, { email: "crew@arbor.st", name: "Sound Crew" });
  await addMembership(t, crew._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, crew._id, arbor.organizationId);
  await setVerticals(t, crew._id, ["Crew"]);

  const admin = await createUser(t, { email: "admin@arbor.st", name: "Portal Admin", role: "admin" });
  await addMembership(t, admin._id, arbor.organizationId, "admin", true);
  await setActiveOrg(t, admin._id, arbor.organizationId);

  const bandAdmin = await createUser(t, { email: "bandadmin@example.com", name: "Band Admin", role: "admin" });
  await addMembership(t, bandAdmin._id, bandOrg.organizationId, "admin", true);
  await setActiveOrg(t, bandAdmin._id, bandOrg.organizationId);

  const ops = await createUser(t, { email: "ops@arbor.st", name: "Jamie Park" });
  await addMembership(t, ops._id, arbor.organizationId, "member", true);
  await setActiveOrg(t, ops._id, arbor.organizationId);
  await setVerticals(t, ops._id, ["Operations"]);

  return {
    ops: asUser(t, ops),
    plain: asUser(t, plain),
    crew: asUser(t, crew),
    admin: asUser(t, admin),
    bandAdmin: asUser(t, bandAdmin),
  };
}

describe("who may email clients", () => {
  it("refuses a member without Operations and a band-org admin on both mutations", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const viewers = await viewersByRole(t);
    const reply = { requestId: ids.requestId, body: "Hi", attachQuote: false, clientRequestId: "a" };

    for (const viewer of [viewers.plain, viewers.crew, viewers.bandAdmin]) {
      await expect(viewer.mutation(api.emailThreads.sendReply, reply)).rejects.toThrow();
      await expect(
        viewer.mutation(api.emailThreads.makeChangeRequest, { messageId: ids.messageId }),
      ).rejects.toThrow();
    }
    expect(
      (await t.run(async (ctx) => ctx.db.query("emailNotifications").collect())).filter(
        (n) => n.template === "booking_reply",
      ),
    ).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(ids.invoiceId)))?.clientApprovalStatus).toBe("pending");
  });

  it("lets a portal admin and an Operations member send and make change requests", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const viewers = await viewersByRole(t);
    await viewers.admin.mutation(api.emailThreads.sendReply, {
      requestId: ids.requestId,
      body: "From admin",
      attachQuote: false,
      clientRequestId: "a",
    });
    await viewers.admin.mutation(api.emailThreads.makeChangeRequest, { messageId: ids.messageId });
    expect((await t.run(async (ctx) => ctx.db.get(ids.invoiceId)))?.clientApprovalStatus).toBe(
      "changes_requested",
    );

    await viewers.ops.mutation(api.emailThreads.sendReply, {
      requestId: ids.requestId,
      body: "From operations",
      attachQuote: false,
      clientRequestId: "b",
    });
    expect(
      (await t.run(async (ctx) => ctx.db.query("emailNotifications").collect())).filter(
        (n) => n.template === "booking_reply",
      ),
    ).toHaveLength(2);
  });

  it("shows everyone in Arbor Live the thread, but canReply only to admins and Operations", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const viewers = await viewersByRole(t);
    const staff = viewers.ops;

    const summary = async (viewer: Test) => {
      const result = await viewer.query(api.emailThreads.getForRecord, { requestId: ids.requestId });
      return [result.canReply, result.messages.map((m) => m.canMakeChangeRequest)];
    };
    expect(await summary(viewers.plain)).toEqual([false, [false]]);
    expect(await summary(viewers.crew)).toEqual([false, [false]]);
    expect(await summary(viewers.admin)).toEqual([true, [true]]);
    expect(await summary(staff)).toEqual([true, [true]]);
    const plainView = await viewers.plain.query(api.emailThreads.getForRecord, { requestId: ids.requestId });
    expect(plainView.messages.map((m) => m.bodyText)).toEqual(["Can we swap the wireless mics for wired?"]);
    await expect(
      viewers.bandAdmin.query(api.emailThreads.getForRecord, { requestId: ids.requestId }),
    ).rejects.toThrow();
  });
});

describe("change requests from an email", () => {
  it("is blocked once the quote went out for review again after the email arrived", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const { staff } = await namedStaff(t, "Jamie Park");
    const buttons = async () =>
      (await staff.query(api.emailThreads.getForRecord, { invoiceId: ids.invoiceId })).messages.map(
        (m) => m.canMakeChangeRequest,
      );
    expect(await buttons()).toEqual([true]);

    // The quote is sent again after the client's email (18:00).
    await t.run(async (ctx) =>
      ctx.db.patch(ids.invoiceId, { clientReviewReadyAt: Date.UTC(2026, 10, 3, 19) }),
    );
    expect(await buttons()).toEqual([false]);
    await expect(
      staff.mutation(api.emailThreads.makeChangeRequest, { messageId: ids.messageId }),
    ).rejects.toThrow(/EMAIL_CHANGE_STALE/);
    const invoice = await t.run(async (ctx) => ctx.db.get(ids.invoiceId));
    expect(invoice?.clientApprovalStatus).toBe("pending");
    expect((await t.run(async (ctx) => ctx.db.get(ids.messageId)))?.changeRequestedAt).toBeUndefined();
  });

  it("uses the same invoice for the button and the action when a newer invoice is linked", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
    const oldInvoiceId = await seedInvoice(t, {
      invoiceNumber: "ALINV-OLDOLDO",
      sourceEventRequestId: requestId,
    });
    const newInvoiceId = await seedInvoice(t, {
      invoiceNumber: "ALINV-NEWNEWN",
      sourceEventRequestId: requestId,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(oldInvoiceId, {
        status: "finalized",
        clientReviewReadyAt: Date.UTC(2026, 10, 3, 17),
      });
      await ctx.db.patch(requestId, { linkedInvoiceId: newInvoiceId });
      await ctx.db.insert("emailThreads", {
        requestId,
        invoiceId: oldInvoiceId,
        lastMessageAt: 0,
        messageCount: 0,
        createdAt: 0,
      });
    });
    await t.mutation(internal.emailInbound.recordInboundEmail, {
      resendEmailId: "re_1",
      messageId: "m1@client.test",
      references: [],
      fromEmail: "maya@client.test",
      to: ["alreq-aaaaaaa@arbor.st"],
      cc: [],
      receivedFor: [],
      subject: "Re: quote",
      text: "Please add a second mic.",
      attachments: [],
      receivedAt: Date.UTC(2026, 10, 3, 18),
    });
    const [message] = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    const { staff } = await namedStaff(t, "Jamie Park");

    for (const record of [{ requestId }, { invoiceId: oldInvoiceId }, { invoiceId: newInvoiceId }]) {
      const result = await staff.query(api.emailThreads.getForRecord, record);
      expect(result.messages.map((m) => m.canMakeChangeRequest)).toEqual([true]);
    }
    await staff.mutation(api.emailThreads.makeChangeRequest, { messageId: message!._id });
    expect((await t.run(async (ctx) => ctx.db.get(oldInvoiceId)))?.clientApprovalNote).toBe(
      "Please add a second mic.",
    );
    expect((await t.run(async (ctx) => ctx.db.get(newInvoiceId)))?.clientApprovalStatus).toBe("pending");
  });

  it("cuts a long email to 2,000 characters on a word boundary and keeps the full email", async () => {
    const t = makeTest();
    const text = "alpha ".repeat(600);
    const ids = await seedReviewedBooking(t, { text });
    const { staff } = await namedStaff(t, "Jamie Park");
    await staff.mutation(api.emailThreads.makeChangeRequest, { messageId: ids.messageId });

    const note = (await t.run(async (ctx) => ctx.db.get(ids.invoiceId)))?.clientApprovalNote;
    expect(note).toBe(`${Array(333).fill("alpha").join(" ")}…`);
    expect(note).toHaveLength(1998);
    expect((await t.run(async (ctx) => ctx.db.get(ids.messageId)))?.bodyText).toBe(text.trim());
  });

  it("truncateOnWord leaves short text alone and never splits a surrogate pair", () => {
    expect(truncateOnWord("  short note  ", 2000)).toBe("short note");
    expect(truncateOnWord("one two three", 9)).toBe("one two…");
    expect(truncateOnWord("one two three", 8)).toBe("one two…");
    expect(truncateOnWord("one two three", 7)).toBe("one…");
    expect(truncateOnWord("abcdefghij", 6)).toBe("abcde…");
    expect(truncateOnWord("ab😀cd", 4)).toBe("ab…");
  });
});

describe("emailThreads.sendReply details", () => {
  const reply = (ids: { requestId: never }, overrides: Record<string, unknown> = {}) => ({
    requestId: ids.requestId,
    body: "Hi",
    attachQuote: false,
    clientRequestId: "a",
    ...overrides,
  });

  it("sends from plain Arbor Live, not the invoice manager, when the sender has no name", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    await t.run(async (ctx) => ctx.db.patch(ids.invoiceId, { managerName: "Rory Manager" }));
    const { staff } = await namedStaff(t, "");
    await staff.mutation(api.emailThreads.sendReply, reply(ids as never));

    const [row] = (await t.run(async (ctx) => ctx.db.query("emailNotifications").collect())).filter(
      (n) => n.template === "booking_reply",
    );
    expect(row!.booking?.from).toBe('"Arbor Live" <bookings@arbor.st>');
    expect(row!.payload).toEqual({
      body: "Hi",
      portalUrl: "http://localhost:3000/request/track/tok-request",
      portalLabel: "Open your request tracker",
    });
  });

  it("names the limit when the request id is too long", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const { staff } = await namedStaff(t, "Jamie Park");
    await expect(
      staff.mutation(api.emailThreads.sendReply, reply(ids as never, { clientRequestId: "x".repeat(101) })),
    ).rejects.toThrow(/max 100, got 101/);
    await expect(
      staff.mutation(api.emailThreads.sendReply, reply(ids as never, { clientRequestId: "  " })),
    ).rejects.toThrow(/missing its request id/);
  });

  it("falls back to the invoice's address when the request's does not parse", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    await t.run(async (ctx) => {
      await ctx.db.patch(ids.requestId, { email: "Maya Rivera <not-an-address" });
      await ctx.db.patch(ids.invoiceId, { clientEmail: "Billing@Client.test" });
    });
    const { staff } = await namedStaff(t, "Jamie Park");
    const view = await staff.query(api.emailThreads.getForRecord, { requestId: ids.requestId });
    expect(view.clientEmail).toBe("billing@client.test");

    await staff.mutation(api.emailThreads.sendReply, reply(ids as never));
    const [row] = (await t.run(async (ctx) => ctx.db.query("emailNotifications").collect())).filter(
      (n) => n.template === "booking_reply",
    );
    expect(row!.to).toBe("billing@client.test");

    await t.run(async (ctx) => ctx.db.patch(ids.invoiceId, { clientEmail: "also bad" }));
    expect(
      (await staff.query(api.emailThreads.getForRecord, { requestId: ids.requestId })).clientEmail,
    ).toBeNull();
    await expect(
      staff.mutation(api.emailThreads.sendReply, reply(ids as never, { clientRequestId: "b" })),
    ).rejects.toThrow(/The client email .*Maya Rivera <not-an-address.* is not a valid address/);
  });

  describe("the portal link", () => {
    async function payloadFor(
      t: Test,
      ids: { requestId: never; invoiceId: never },
      patch: { invoice?: Record<string, unknown>; request?: Record<string, unknown> },
    ) {
      await t.run(async (ctx) => {
        if (patch.invoice) await ctx.db.patch(ids.invoiceId, patch.invoice as never);
        if (patch.request) await ctx.db.patch(ids.requestId, patch.request as never);
      });
      const { staff } = await namedStaff(t, "Jamie Park");
      await staff.mutation(api.emailThreads.sendReply, reply(ids as never));
      const rows = await t.run(async (ctx) => ctx.db.query("emailNotifications").collect());
      const payload = rows.find((n) => n.template === "booking_reply")!.payload as Record<string, unknown>;
      return [payload.portalUrl ?? null, payload.portalLabel ?? null];
    }

    it("links a live quote when the booking has no tracker", async () => {
      const t = makeTest();
      const ids = await seedReviewedBooking(t);
      expect(
        await payloadFor(t, ids as never, {
          request: { publicToken: undefined },
          invoice: { publicApprovalToken: "quote-tok", publicApprovalTokenExpiresAt: Date.now() + 100_000 },
        }),
      ).toEqual(["http://localhost:3000/event/quote-tok", "Open your quote"]);
    });

    it("drops the quote link when the quote is void or its link expired", async () => {
      for (const invoice of [
        { publicApprovalToken: "quote-tok", status: "void" as const },
        { publicApprovalToken: "quote-tok", publicApprovalTokenExpiresAt: Date.now() - 1000 },
      ]) {
        const t = makeTest();
        const ids = await seedReviewedBooking(t);
        expect(await payloadFor(t, ids as never, { request: { publicToken: undefined }, invoice })).toEqual([
          null,
          null,
        ]);
      }
    });

    it("falls back to the request tracker when the quote link is dead", async () => {
      const t = makeTest();
      const ids = await seedReviewedBooking(t);
      expect(
        await payloadFor(t, ids as never, {
          // The invoice is not tied to the request by sourceEventRequestId, so the quote link is tried first.
          invoice: {
            sourceEventRequestId: undefined,
            publicApprovalToken: "quote-tok",
            publicApprovalTokenExpiresAt: Date.now() - 1000,
          },
        }),
      ).toEqual(["http://localhost:3000/request/track/tok-request", "Open your request tracker"]);
    });
  });
});

describe("failed replies", () => {
  async function sendOneReply(t: Test, ids: { requestId: never }, staff: Test) {
    await staff.mutation(api.emailThreads.sendReply, {
      requestId: ids.requestId,
      body: "Wired mics work.",
      attachQuote: false,
      clientRequestId: "attempt-1",
    });
    const rows = await t.run(async (ctx) => ctx.db.query("emailNotifications").collect());
    return rows.find((n) => n.template === "booking_reply")!;
  }

  it("shows a reply that failed to send, and queues it again on retry", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const { staff } = await namedStaff(t, "Jamie Park");
    const notification = await sendOneReply(t, ids as never, staff);
    const view = () => staff.query(api.emailThreads.getForRecord, { eventId: ids.eventId });

    expect((await view()).failedReplies).toEqual([]);

    await t.run(async (ctx) =>
      ctx.db.patch(notification._id, { status: "failed", error: "[Resend] invalid_to_address" }),
    );
    expect((await view()).failedReplies).toEqual([
      {
        _id: notification._id,
        to: "maya@client.test",
        cc: [],
        bodyPreview: "Wired mics work.",
        error: "[Resend] invalid_to_address",
        createdAt: notification.createdAt,
      },
    ]);

    await staff.mutation(api.emailThreads.retryReply, { notificationId: notification._id });

    const retried = await t.run(async (ctx) => ctx.db.get(notification._id));
    expect(retried).toMatchObject({ status: "queued", idempotencyKey: notification.idempotencyKey });
    expect(retried?.error).toBeUndefined();
    expect((await view()).failedReplies).toEqual([]);
    const scheduled = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter(
        (row) => row.name.endsWith("sendQueuedEmail") && row.state.kind === "pending",
      ),
    );
    expect(scheduled.map((row) => row.args[0])).toContainEqual({ notificationId: notification._id });
  });

  it("ignores failures of other emails and bounds the preview", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const { staff } = await namedStaff(t, "Jamie Park");
    const notification = await sendOneReply(t, ids as never, staff);
    await t.run(async (ctx) => {
      await ctx.db.patch(notification._id, {
        status: "failed",
        error: "boom",
        payload: { body: "y".repeat(800) },
      });
      await ctx.db.insert("emailNotifications", {
        template: "booking_quote_ready",
        status: "failed",
        to: "maya@client.test",
        subject: "Your quote",
        booking: { threadId: notification.booking!.threadId, from: '"Arbor Live" <bookings@arbor.st>' },
        idempotencyKey: "quote-ready",
        payload: {},
        error: "other failure",
        createdAt: 1,
      });
    });
    const { failedReplies } = await staff.query(api.emailThreads.getForRecord, { requestId: ids.requestId });
    expect(failedReplies.map((reply) => [reply.error, reply.bodyPreview.length])).toEqual([["boom", 500]]);
  });

  it("refuses to retry a reply that is not failed, another email, and non-Operations callers", async () => {
    const t = makeTest();
    const ids = await seedReviewedBooking(t);
    const viewers = await viewersByRole(t);
    const staff = viewers.ops;
    const notification = await sendOneReply(t, ids as never, staff);

    await expect(
      staff.mutation(api.emailThreads.retryReply, { notificationId: notification._id }),
    ).rejects.toThrow(/EMAIL_RETRY_NOT_FAILED/);

    await t.run(async (ctx) => ctx.db.patch(notification._id, { status: "failed", error: "boom" }));
    for (const viewer of [viewers.plain, viewers.bandAdmin]) {
      await expect(
        viewer.mutation(api.emailThreads.retryReply, { notificationId: notification._id }),
      ).rejects.toThrow();
    }
    expect((await t.run(async (ctx) => ctx.db.get(notification._id)))?.status).toBe("failed");

    const otherId = await t.run(async (ctx) =>
      ctx.db.insert("emailNotifications", {
        template: "booking_quote_ready",
        status: "failed",
        to: "maya@client.test",
        subject: "Your quote",
        booking: { threadId: notification.booking!.threadId, from: '"Arbor Live" <bookings@arbor.st>' },
        idempotencyKey: "quote-ready",
        payload: {},
        createdAt: 1,
      }),
    );
    await expect(staff.mutation(api.emailThreads.retryReply, { notificationId: otherId })).rejects.toThrow(
      /EMAIL_RETRY_NOT_FOUND/,
    );
    await viewers.admin.mutation(api.emailThreads.retryReply, { notificationId: notification._id });
    expect((await t.run(async (ctx) => ctx.db.get(notification._id)))?.status).toBe("queued");
  });
});
