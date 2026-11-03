// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { scheduleBookingRequestReceivedEmail } from "./email/bookingRequestEmails";
import { seedInvoice, seedRequest } from "./test/bookingSeeds.helpers";
import { createUser, makeTest, type Test } from "./test/setup.helpers";

/** Renders React Email (and a PDF for quotes); a loaded CI runner needs more than the 5s default. */
const SEND_TEST_TIMEOUT_MS = 15_000;

const SENT_AT = Date.UTC(2026, 10, 3, 18);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function seedThread(t: Test, staff: { assignee?: string; manager?: string } = {}) {
  const requestId = await seedRequest(t, {
    requestNumber: "ALREQ-AAAAAAA",
    assigneeUserId: staff.assignee,
  });
  const invoiceId = await seedInvoice(t, {
    invoiceNumber: "ALINV-BBBBBBB",
    sourceEventRequestId: requestId,
    managerUserId: staff.manager,
  });
  await t.run(async (ctx) => ctx.db.patch(requestId, { linkedInvoiceId: invoiceId }));
  const threadId = await t.run(async (ctx) =>
    ctx.db.insert("emailThreads", {
      requestId,
      invoiceId,
      lastMessageAt: SENT_AT,
      messageCount: 0,
      createdAt: SENT_AT,
    }),
  );
  return { requestId, invoiceId, threadId };
}

function outbound(threadId: Id<"emailThreads">, overrides = {}) {
  return {
    threadId,
    resendEmailId: "re_out_1",
    fromEmail: "bookings@arbor.st",
    fromName: "Alex Manager at Arbor Live",
    to: ["maya@client.test"],
    cc: ["alex@arbor.test"],
    subject: "Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)",
    bodyText: "Your quote is ready.",
    attachments: [{ filename: "ALINV-BBBBBBB.pdf" }],
    references: [],
    sentAt: SENT_AT,
    ...overrides,
  };
}

describe("getThreadHeaders", () => {
  it("lists inbound and outbound message ids in order, skipping messages with no id yet", async () => {
    const t = makeTest();
    const { threadId } = await seedThread(t);
    await t.mutation(internal.emailOutbound.recordOutboundEmail, outbound(threadId, { messageId: "out1@resend.dev" }));
    await t.mutation(internal.emailInbound.recordInboundEmail, {
      resendEmailId: "re_in_1",
      messageId: "reply1@client.test",
      inReplyTo: "out1@resend.dev",
      references: ["out1@resend.dev"],
      fromEmail: "maya@client.test",
      to: ["alreq-aaaaaaa@arbor.st"],
      cc: [],
      receivedFor: ["alreq-aaaaaaa@arbor.st"],
      subject: "Re: Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)",
      text: "Thanks!",
      attachments: [],
      receivedAt: SENT_AT + 60_000,
    });
    await t.mutation(
      internal.emailOutbound.recordOutboundEmail,
      outbound(threadId, { resendEmailId: "re_out_2", sentAt: SENT_AT + 120_000 }),
    );

    expect(await t.query(internal.emailOutbound.getThreadHeaders, { threadId })).toEqual({
      inReplyTo: "reply1@client.test",
      references: ["out1@resend.dev", "reply1@client.test"],
    });
  });

  it("is empty for a thread with no messages", async () => {
    const t = makeTest();
    const { threadId } = await seedThread(t);
    expect(await t.query(internal.emailOutbound.getThreadHeaders, { threadId })).toEqual({
      inReplyTo: undefined,
      references: [],
    });
  });
});

describe("recordOutboundEmail", () => {
  it("stores an outbound row, counts it on the thread and notifies nobody", async () => {
    const t = makeTest();
    const manager = await createUser(t, { name: "Alex Manager", email: "alex@arbor.test" });
    const { threadId } = await seedThread(t, { assignee: manager._id, manager: manager._id });

    const result = await t.mutation(
      internal.emailOutbound.recordOutboundEmail,
      outbound(threadId, { messageId: "out1@resend.dev" }),
    );

    expect(result).toBe("recorded");
    const messages = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      threadId,
      direction: "outbound",
      resendEmailId: "re_out_1",
      messageId: "out1@resend.dev",
      fromEmail: "bookings@arbor.st",
      fromName: "Alex Manager at Arbor Live",
      to: ["maya@client.test"],
      cc: ["alex@arbor.test"],
      subject: "Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)",
      bodyText: "Your quote is ready.",
      attachments: [{ filename: "ALINV-BBBBBBB.pdf" }],
      receivedAt: SENT_AT,
    });
    const thread = await t.run(async (ctx) => ctx.db.get(threadId));
    expect(thread).toMatchObject({ messageCount: 1, lastMessageAt: SENT_AT });
    expect(await t.run(async (ctx) => ctx.db.query("notifications").collect())).toHaveLength(0);
  });

  it("is idempotent by Resend email id", async () => {
    const t = makeTest();
    const { threadId } = await seedThread(t);
    await t.mutation(internal.emailOutbound.recordOutboundEmail, outbound(threadId, { messageId: "a@b.test" }));
    expect(
      await t.mutation(internal.emailOutbound.recordOutboundEmail, outbound(threadId, { messageId: "a@b.test" })),
    ).toBe("duplicate");
    const thread = await t.run(async (ctx) => ctx.db.get(threadId));
    expect(thread!.messageCount).toBe(1);
  });

  it("caps the stored body at 20,000 characters", async () => {
    const t = makeTest();
    const { threadId } = await seedThread(t);
    await t.mutation(
      internal.emailOutbound.recordOutboundEmail,
      outbound(threadId, { messageId: "a@b.test", bodyText: "x".repeat(25_000) }),
    );
    const [message] = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    expect(message!.bodyText).toHaveLength(20_000);
  });
});

async function scheduledCaptures(t: Test) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.system.query("_scheduled_functions").collect();
    return rows
      .filter((row) => row.name.endsWith("captureMessageId"))
      .map((row) => ({ args: row.args[0] as { attempt: number }, scheduledTime: row.scheduledTime }));
  });
}

describe("captureMessageId", () => {
  async function recordPending(t: Test) {
    const { threadId } = await seedThread(t);
    await t.mutation(internal.emailOutbound.recordOutboundEmail, outbound(threadId));
    const [message] = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    return message!._id;
  }

  it("schedules the first lookup 10 seconds after a send with no message id", async () => {
    const t = makeTest();
    await recordPending(t);
    const [capture] = await scheduledCaptures(t);
    expect(capture!.args.attempt).toBe(0);
    expect(capture!.scheduledTime - Date.now()).toBe(10_000);
  });

  it("stores the message id without angle brackets", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.fn(async () =>
      Response.json({ id: "re_out_1", message_id: "<abc123@email.resend.com>" }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = makeTest();
    const messageRowId = await recordPending(t);

    await t.action(internal.emailOutbound.captureMessageId, { messageRowId, attempt: 0 });

    expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails/re_out_1", {
      headers: { Authorization: "Bearer re_test" },
    });
    const message = await t.run(async (ctx) => ctx.db.get(messageRowId));
    expect(message!.messageId).toBe("abc123@email.resend.com");
  });

  it("retries after 60s and then 5min while message_id is missing, then gives up", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "re_out_1", message_id: null })));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = makeTest();
    const messageRowId = await recordPending(t);

    await t.action(internal.emailOutbound.captureMessageId, { messageRowId, attempt: 0 });
    await t.action(internal.emailOutbound.captureMessageId, { messageRowId, attempt: 1 });
    await t.action(internal.emailOutbound.captureMessageId, { messageRowId, attempt: 2 });

    const captures = await scheduledCaptures(t);
    expect(captures.map((c) => c.args.attempt)).toEqual([0, 1, 2]);
    expect(captures[1]!.scheduledTime - Date.now()).toBe(60_000);
    expect(captures[2]!.scheduledTime - Date.now()).toBe(5 * 60_000);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const message = await t.run(async (ctx) => ctx.db.get(messageRowId));
    expect(message!.messageId).toBeUndefined();
  });

  it("retries when Resend answers with a server error", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 503 })));
    const t = makeTest();
    const messageRowId = await recordPending(t);

    await t.action(internal.emailOutbound.captureMessageId, { messageRowId, attempt: 0 });

    expect((await scheduledCaptures(t)).map((c) => c.args.attempt)).toEqual([0, 1]);
  });

  it("does not call Resend when the id is already stored", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const t = makeTest();
    const { threadId } = await seedThread(t);
    await t.mutation(internal.emailOutbound.recordOutboundEmail, outbound(threadId, { messageId: "a@b.test" }));
    const [message] = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());

    await t.action(internal.emailOutbound.captureMessageId, { messageRowId: message!._id, attempt: 0 });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("sendQueuedEmail with the e2e mock", () => {
  it("sends a booking email from the booking sender and records it with a mock message id", async () => {
    vi.stubEnv("E2E_EMAIL_MOCK", "true");
    vi.stubEnv("E2E_HELPERS", "true");
    vi.stubEnv("SITE_URL", "http://localhost:3000");
    const t = makeTest();
    const manager = await createUser(t, { name: "Rory Manager", email: "rory@arbor.test" });
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA", assigneeUserId: manager._id });
    await t.run(async (ctx) =>
      ctx.db.patch(requestId, { eventName: "Winter Gala", publicToken: "tok" }),
    );
    const notificationId = await t.run(async (ctx) => {
      await scheduleBookingRequestReceivedEmail(ctx, (await ctx.db.get(requestId))!);
      const rows = await ctx.db.query("emailNotifications").collect();
      return rows.find((row) => row.template === "booking_request_received")!._id;
    });

    await t.action(internal.email.send.sendQueuedEmail, { notificationId });

    const notification = await t.run(async (ctx) => ctx.db.get(notificationId));
    expect(notification).toMatchObject({ status: "sent", resendId: `e2e-mock:${notificationId}` });
    const [message] = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    expect(message).toMatchObject({
      direction: "outbound",
      threadId: notification!.emailThreadId,
      resendEmailId: `e2e-mock:${notificationId}`,
      messageId: `e2e-mock-${notificationId}@arbor.st`,
      fromEmail: "bookings@arbor.st",
      fromName: "Rory Manager at Arbor Live",
      to: ["maya@client.test"],
      cc: [],
      subject: "Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)",
      attachments: [],
    });
    expect(message!.bodyText.startsWith("REQUEST RECEIVED\n\nHi Maya,")).toBe(true);
    expect(await scheduledCaptures(t)).toHaveLength(0);
  }, SEND_TEST_TIMEOUT_MS);

  it("leaves a non-booking email unrecorded", async () => {
    vi.stubEnv("E2E_EMAIL_MOCK", "true");
    vi.stubEnv("E2E_HELPERS", "true");
    vi.stubEnv("SITE_URL", "http://localhost:3000");
    const t = makeTest();
    const notificationId = await t.run(async (ctx) =>
      ctx.db.insert("emailNotifications", {
        template: "password_reset",
        status: "queued",
        to: "someone@arbor.test",
        subject: "Reset your Arbor Live password",
        idempotencyKey: "reset-1",
        payload: { recipientName: "Sam", resetUrl: "http://localhost:3000/reset" },
        createdAt: Date.now(),
      }),
    );

    await t.action(internal.email.send.sendQueuedEmail, { notificationId });

    expect(await t.run(async (ctx) => ctx.db.query("emailMessages").collect())).toHaveLength(0);
    expect((await t.run(async (ctx) => ctx.db.get(notificationId)))!.status).toBe("sent");
  });
});

