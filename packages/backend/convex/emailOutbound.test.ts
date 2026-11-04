// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { scheduleBookingRequestReceivedEmail } from "./email/bookingRequestEmails";
import { seedInvoice, seedRequest } from "./test/bookingSeeds.helpers";
import { createUser, makeTest, type Test } from "./test/setup.helpers";

/** The component's view of each email, keyed by component id, for `resendClient.get`. */
const componentEmails = vi.hoisted(
  () => new Map<string, { status: string; resendId?: string; errorMessage?: string }>(),
);

vi.mock("@convex-dev/resend", () => ({
  Resend: class {
    async get(_ctx: unknown, emailId: string) {
      return componentEmails.get(emailId) ?? null;
    }
  },
}));

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

let notificationSeq = 0;

/** Queue a booking notification and report it sent with `message`, as `sendQueuedEmail` does. */
async function markSent(t: Test, message: ReturnType<typeof outbound>) {
  notificationSeq += 1;
  const notificationId = await t.run(async (ctx) =>
    ctx.db.insert("emailNotifications", {
      template: "quote_updated",
      status: "queued",
      to: "maya@client.test",
      subject: message.subject,
      booking: { threadId: message.threadId, from: '"Arbor Live" <bookings@arbor.st>' },
      idempotencyKey: `quote_updated:${notificationSeq}`,
      payload: {},
      createdAt: SENT_AT,
    }),
  );
  const outcome = await t.mutation(internal.emailOutbound.markBookingEmailSent, {
    notificationId,
    resendId: "component-email-1",
    message,
  });
  return { notificationId, outcome };
}

async function insertMessage(t: Test, threadId: Id<"emailThreads">, n: number, messageId?: string) {
  await t.run(async (ctx) =>
    ctx.db.insert("emailMessages", {
      threadId,
      direction: n % 2 === 0 ? "outbound" : "inbound",
      resendEmailId: `re_${n}`,
      messageId,
      references: [],
      fromEmail: "maya@client.test",
      to: ["alreq-aaaaaaa@arbor.st"],
      cc: [],
      subject: "Re: Winter Gala",
      bodyText: "Hi",
      attachments: [],
      receivedAt: SENT_AT + n * 60_000,
    }),
  );
}

describe("getThreadHeaders", () => {
  it("lists inbound and outbound message ids in order, skipping messages with no id yet", async () => {
    const t = makeTest();
    const { threadId } = await seedThread(t);
    await markSent(t, outbound(threadId, { messageId: "out1@resend.dev" }));
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
    await markSent(t, outbound(threadId, { resendEmailId: "re_out_2", sentAt: SENT_AT + 120_000 }));

    expect(await t.query(internal.emailOutbound.getThreadHeaders, { threadId })).toEqual({
      inReplyTo: "reply1@client.test",
      references: ["out1@resend.dev", "reply1@client.test"],
    });
  });

  it("keeps the thread's first id plus the last 9 on a long thread", async () => {
    const t = makeTest();
    const { threadId } = await seedThread(t);
    await insertMessage(t, threadId, 0);
    for (let n = 1; n <= 20; n += 1) await insertMessage(t, threadId, n, `m${n}@x.test`);

    expect(await t.query(internal.emailOutbound.getThreadHeaders, { threadId })).toEqual({
      inReplyTo: "m20@x.test",
      references: [
        "m1@x.test",
        "m12@x.test",
        "m13@x.test",
        "m14@x.test",
        "m15@x.test",
        "m16@x.test",
        "m17@x.test",
        "m18@x.test",
        "m19@x.test",
        "m20@x.test",
      ],
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

describe("markBookingEmailSent", () => {
  it("marks the notification sent and records the outbound row in one call, notifying nobody", async () => {
    const t = makeTest();
    const manager = await createUser(t, { name: "Alex Manager", email: "alex@arbor.test" });
    const { threadId } = await seedThread(t, { assignee: manager._id, manager: manager._id });

    const { notificationId, outcome } = await markSent(
      t,
      outbound(threadId, { messageId: "out1@resend.dev" }),
    );

    expect(outcome).toBe("recorded");
    expect(await t.run(async (ctx) => ctx.db.get(notificationId))).toMatchObject({
      status: "sent",
      resendId: "component-email-1",
    });
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
    await markSent(t, outbound(threadId, { messageId: "a@b.test" }));
    expect((await markSent(t, outbound(threadId, { messageId: "a@b.test" }))).outcome).toBe(
      "duplicate",
    );
    const thread = await t.run(async (ctx) => ctx.db.get(threadId));
    expect(thread!.messageCount).toBe(1);
  });

  it("reports a deleted thread as thread_missing and still marks the email sent", async () => {
    const t = makeTest();
    const { threadId } = await seedThread(t);
    const message = outbound(threadId, { messageId: "a@b.test" });
    await t.run(async (ctx) => ctx.db.delete(threadId));

    const { notificationId, outcome } = await markSent(t, message);

    expect(outcome).toBe("thread_missing");
    expect((await t.run(async (ctx) => ctx.db.get(notificationId)))!.status).toBe("sent");
    expect(await t.run(async (ctx) => ctx.db.query("emailMessages").collect())).toHaveLength(0);
  });

  it("caps the stored body at 20,000 characters", async () => {
    const t = makeTest();
    const { threadId } = await seedThread(t);
    await markSent(t, outbound(threadId, { messageId: "a@b.test", bodyText: "x".repeat(25_000) }));
    const [message] = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    expect(message!.bodyText).toHaveLength(20_000);
  });
});

async function scheduledCaptures(t: Test) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.system.query("_scheduled_functions").collect();
    return rows
      .filter((row) => row.name.endsWith("captureMessageId"))
      .map((row) => ({
        args: row.args[0] as {
          messageRowId: Id<"emailMessages">;
          attempt: number;
          componentEmailId?: string;
        },
        scheduledTime: row.scheduledTime,
      }));
  });
}

describe("captureMessageId", () => {
  async function recordPending(t: Test, overrides = {}) {
    const { threadId } = await seedThread(t);
    await markSent(t, outbound(threadId, overrides));
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

  it("retries on the backoff while message_id is missing, then gives up", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "re_out_1", message_id: null })));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const t = makeTest();
    const messageRowId = await recordPending(t);

    for (let attempt = 0; attempt <= 4; attempt += 1) {
      await t.action(internal.emailOutbound.captureMessageId, { messageRowId, attempt });
    }

    const captures = await scheduledCaptures(t);
    expect(captures.map((c) => c.args.attempt)).toEqual([0, 1, 2, 3, 4]);
    expect(captures.slice(1).map((c) => c.scheduledTime - Date.now())).toEqual([
      60_000,
      5 * 60_000,
      10 * 60_000,
      15 * 60_000,
    ]);
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
    await markSent(t, outbound(threadId, { messageId: "a@b.test" }));
    const [message] = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());

    await t.action(internal.emailOutbound.captureMessageId, { messageRowId: message!._id, attempt: 0 });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe("for a component send", () => {
    afterEach(() => {
      componentEmails.clear();
    });

    it("waits for the component to send, then resolves Resend's id and the message id", async () => {
      vi.stubEnv("RESEND_API_KEY", "re_test");
      const fetchMock = vi.fn(async () =>
        Response.json({ id: "re_live_9", message_id: "<live9@email.resend.com>" }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const t = makeTest();
      const messageRowId = await recordPending(t, {
        resendEmailId: "component-email-9",
        componentEmailId: "component-email-9",
      });
      const [first] = await scheduledCaptures(t);
      expect(first!.args).toEqual({ messageRowId, attempt: 0, componentEmailId: "component-email-9" });

      componentEmails.set("component-email-9", { status: "queued" });
      await t.action(internal.emailOutbound.captureMessageId, first!.args);
      expect(fetchMock).not.toHaveBeenCalled();
      expect((await scheduledCaptures(t)).map((c) => c.args.attempt)).toEqual([0, 1]);

      componentEmails.set("component-email-9", { status: "sent", resendId: "re_live_9" });
      await t.action(internal.emailOutbound.captureMessageId, {
        messageRowId,
        attempt: 1,
        componentEmailId: "component-email-9",
      });

      expect(fetchMock).toHaveBeenCalledWith("https://api.resend.com/emails/re_live_9", {
        headers: { Authorization: "Bearer re_test" },
      });
      const message = await t.run(async (ctx) => ctx.db.get(messageRowId));
      expect(message).toMatchObject({
        resendEmailId: "re_live_9",
        messageId: "live9@email.resend.com",
      });
    });

    it("keeps Resend's id and retries when message_id is still missing", async () => {
      vi.stubEnv("RESEND_API_KEY", "re_test");
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ id: "re_live_9", message_id: null })));
      const t = makeTest();
      const messageRowId = await recordPending(t, {
        resendEmailId: "component-email-9",
        componentEmailId: "component-email-9",
      });
      componentEmails.set("component-email-9", { status: "sent", resendId: "re_live_9" });

      await t.action(internal.emailOutbound.captureMessageId, {
        messageRowId,
        attempt: 0,
        componentEmailId: "component-email-9",
      });

      const message = await t.run(async (ctx) => ctx.db.get(messageRowId));
      expect(message!.resendEmailId).toBe("re_live_9");
      expect(message!.messageId).toBeUndefined();
      expect((await scheduledCaptures(t)).map((c) => c.args.attempt)).toEqual([0, 1]);
    });

    it("stops loudly when the component failed the email", async () => {
      vi.stubEnv("RESEND_API_KEY", "re_test");
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const t = makeTest();
      const messageRowId = await recordPending(t, {
        resendEmailId: "component-email-9",
        componentEmailId: "component-email-9",
      });
      componentEmails.set("component-email-9", { status: "failed", errorMessage: "422 invalid" });

      await t.action(internal.emailOutbound.captureMessageId, {
        messageRowId,
        attempt: 0,
        componentEmailId: "component-email-9",
      });

      expect(errorSpy).toHaveBeenCalledWith(
        "Booking email component-email-9 has no Message-ID: failed in the Resend component: 422 invalid",
      );
      expect((await scheduledCaptures(t)).map((c) => c.args.attempt)).toEqual([0]);
    });
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
      threadId: notification!.booking!.threadId,
      resendEmailId: `e2e-mock:${notificationId}`,
      messageId: `e2e-mock-${notificationId}@arbor.st`,
      fromEmail: "bookings@arbor.st",
      fromName: "Rory Manager at Arbor Live",
      to: ["maya@client.test"],
      cc: ["arborlive@stanford.edu"],
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

