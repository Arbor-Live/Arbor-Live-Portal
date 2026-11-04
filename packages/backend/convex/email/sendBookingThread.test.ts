// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import {
  scheduleBookingQuoteReadyEmail,
  scheduleBookingRequestReceivedEmail,
} from "./bookingRequestEmails";
import { seedInvoice, seedRequest } from "../test/bookingSeeds.helpers";
import {
  addMembership,
  asUser,
  createOrg,
  createUser,
  makeTest,
  setActiveOrg,
  setVerticals,
  type Test,
} from "../test/setup.helpers";

/** Renders React Email (and a PDF for quotes); a loaded CI runner needs more than the 5s default. */
const SEND_TEST_TIMEOUT_MS = 15_000;

const resend = vi.hoisted(() => ({
  componentSends: [] as Array<Record<string, unknown>>,
  sdkSends: [] as Array<{ payload: Record<string, unknown>; options: unknown }>,
  sdkResult: { data: { id: "re_live_123" }, error: null } as {
    data: { id: string } | null;
    error: { name: string; message: string; statusCode: number | null } | null;
  },
}));

vi.mock("@convex-dev/resend", () => ({
  Resend: class {
    async sendEmail(_ctx: unknown, options: Record<string, unknown>) {
      resend.componentSends.push(options);
      return "component-email-1";
    }
    async sendEmailManually(
      _ctx: unknown,
      _options: unknown,
      send: (emailId: string) => Promise<string>,
    ) {
      await send("component-manual-1");
      return "component-manual-1";
    }
  },
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (payload: Record<string, unknown>, options: unknown) => {
        resend.sdkSends.push({ payload, options });
        return resend.sdkResult;
      },
    };
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("SITE_URL", "http://localhost:3000");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  resend.componentSends.length = 0;
  resend.sdkSends.length = 0;
  resend.sdkResult = { data: { id: "re_live_123" }, error: null };
});

async function seedBooking(t: Test) {
  const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
  const invoiceId = await seedInvoice(t, {
    invoiceNumber: "ALINV-BBBBBBB",
    sourceEventRequestId: requestId,
  });
  await t.run(async (ctx) =>
    ctx.db.patch(requestId, {
      eventName: "Winter Gala",
      publicToken: "tok",
      linkedInvoiceId: invoiceId,
    }),
  );
  return { requestId, invoiceId };
}

async function queuedNotification(t: Test, template: string) {
  const rows = await t.run(async (ctx) => ctx.db.query("emailNotifications").collect());
  return rows.find((row) => row.template === template)!;
}

/** A client message already on the thread, so the email carries reply headers. */
async function addClientMessage(t: Test, threadId: Id<"emailThreads">) {
  await t.run(async (ctx) =>
    ctx.db.insert("emailMessages", {
      threadId,
      direction: "inbound",
      resendEmailId: "re_inbound_1",
      messageId: "client-1@gmail.test",
      references: [],
      fromEmail: "maya@client.test",
      to: ["alreq-aaaaaaa@arbor.st"],
      cc: [],
      subject: "Question",
      bodyText: "Hi",
      attachments: [],
      receivedAt: Date.UTC(2026, 10, 3, 17),
    }),
  );
}

async function enqueueQuoteReady(t: Test, people: { client?: string; manager?: string } = {}) {
  const { requestId, invoiceId } = await seedBooking(t);
  await t.run(async (ctx) => {
    if (people.client) await ctx.db.patch(requestId, { email: people.client });
    await ctx.db.patch(invoiceId, {
      clientReviewReadyAt: Date.UTC(2026, 10, 3, 18),
      clientReadyMessage: "Here is your quote.",
      managerEmail: people.manager,
    });
    await scheduleBookingQuoteReadyEmail(ctx, {
      request: (await ctx.db.get(requestId))!,
      invoice: (await ctx.db.get(invoiceId))!,
    });
  });
  return await queuedNotification(t, "booking_quote_ready");
}

async function scheduledSends(t: Test) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.system.query("_scheduled_functions").collect();
    return rows
      .filter((row) => row.name.endsWith("sendQueuedEmail") && row.state.kind === "pending")
      .map((row) => ({
        args: row.args[0] as { attempt?: number },
        delayMs: row.scheduledTime - Date.now(),
      }));
  });
}

describe("sendQueuedEmail for a booking email without attachments", () => {
  it("goes through the component with the thread headers and a stable idempotency key", async () => {
    const t = makeTest();
    const { requestId } = await seedBooking(t);
    await t.run(async (ctx) =>
      scheduleBookingRequestReceivedEmail(ctx, (await ctx.db.get(requestId))!),
    );
    const notification = await queuedNotification(t, "booking_request_received");
    await addClientMessage(t, notification.booking!.threadId);

    await t.action(internal.email.send.sendQueuedEmail, { notificationId: notification._id });

    expect(resend.sdkSends).toHaveLength(0);
    expect(resend.componentSends).toHaveLength(1);
    expect(resend.componentSends[0]).toMatchObject({
      from: '"Alex Manager at Arbor Live" <bookings@arbor.st>',
      to: "maya@client.test",
      replyTo: ["alreq-aaaaaaa@arbor.st"],
      subject: "Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)",
      headers: [
        { name: "In-Reply-To", value: "<client-1@gmail.test>" },
        { name: "References", value: "<client-1@gmail.test>" },
      ],
      idempotencyKey: `emailNotifications:${notification._id}`,
    });
    expect(await t.run(async (ctx) => ctx.db.get(notification._id))).toMatchObject({
      status: "sent",
      resendId: "component-email-1",
    });
    const outbound = await t.run(async (ctx) =>
      (await ctx.db.query("emailMessages").collect()).filter((m) => m.direction === "outbound"),
    );
    expect(outbound.map((m) => [m.threadId, m.resendEmailId])).toEqual([
      [notification.booking!.threadId, "component-email-1"],
    ]);
    const captures = await t.run(async (ctx) =>
      (await ctx.db.system.query("_scheduled_functions").collect()).filter((row) =>
        row.name.endsWith("captureMessageId"),
      ),
    );
    expect(captures.map((row) => row.args[0])).toEqual([
      { messageRowId: outbound[0]!._id, attempt: 0, componentEmailId: "component-email-1" },
    ]);
  }, SEND_TEST_TIMEOUT_MS);
});

describe("sendQueuedEmail for the quote PDF", () => {
  it("uses the raw SDK with an HTTP idempotency key and records Resend's id", async () => {
    const t = makeTest();
    const notification = await enqueueQuoteReady(t);

    await t.action(internal.email.send.sendQueuedEmail, { notificationId: notification._id });

    expect(resend.componentSends).toHaveLength(0);
    expect(resend.sdkSends).toHaveLength(1);
    const [send] = resend.sdkSends;
    expect(send!.options).toEqual({ idempotencyKey: `emailNotifications:${notification._id}` });
    expect(send!.payload).toMatchObject({
      from: '"Alex Manager at Arbor Live" <bookings@arbor.st>',
      replyTo: ["alreq-aaaaaaa@arbor.st"],
      subject: "Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)",
      attachments: [expect.objectContaining({ filename: "ALINV-BBBBBBB.pdf" })],
    });
    expect(send!.payload.headers).toBeUndefined();
    const [message] = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    expect(message).toMatchObject({
      direction: "outbound",
      resendEmailId: "re_live_123",
      attachments: [{ filename: "ALINV-BBBBBBB.pdf" }],
    });
  }, SEND_TEST_TIMEOUT_MS);

  it("sends thread headers as MIME headers and no MIME Idempotency-Key", async () => {
    const t = makeTest();
    const notification = await enqueueQuoteReady(t);
    await addClientMessage(t, notification.booking!.threadId);

    await t.action(internal.email.send.sendQueuedEmail, { notificationId: notification._id });

    expect(resend.sdkSends[0]!.payload.headers).toEqual({
      "In-Reply-To": "<client-1@gmail.test>",
      References: "<client-1@gmail.test>",
    });
  }, SEND_TEST_TIMEOUT_MS);

  it("copies Arbor Live and the quote's manager on the quote email", async () => {
    const t = makeTest();

    const notification = await enqueueQuoteReady(t, { manager: "alex@arbor.test" });
    await t.action(internal.email.send.sendQueuedEmail, { notificationId: notification._id });

    expect(notification.cc).toEqual(["arborlive@stanford.edu", "alex@arbor.test"]);
    expect(resend.sdkSends[0]!.payload.cc).toEqual(["arborlive@stanford.edu", "alex@arbor.test"]);
  }, SEND_TEST_TIMEOUT_MS);

  it("leaves real CCs off in EMAIL_TEST_MODE and sends to a test inbox", async () => {
    vi.stubEnv("EMAIL_TEST_MODE", "true");
    const t = makeTest();

    const notification = await enqueueQuoteReady(t, {
      client: "delivered@resend.dev",
      manager: "alex@arbor.test",
    });
    await t.action(internal.email.send.sendQueuedEmail, { notificationId: notification._id });

    expect(notification.cc).toEqual(["arborlive@stanford.edu", "alex@arbor.test"]);
    expect(resend.sdkSends[0]!.payload.cc).toBeUndefined();
    const [message] = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    expect(message!.cc).toEqual([]);
  }, SEND_TEST_TIMEOUT_MS);

  it("refuses a real address in EMAIL_TEST_MODE before sending", async () => {
    vi.stubEnv("EMAIL_TEST_MODE", "true");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = makeTest();
    const notification = await enqueueQuoteReady(t);

    await t.action(internal.email.send.sendQueuedEmail, { notificationId: notification._id });

    expect(resend.sdkSends).toHaveLength(0);
    expect(await t.run(async (ctx) => ctx.db.get(notification._id))).toMatchObject({
      status: "failed",
      error:
        "EMAIL_TEST_MODE is on and these recipients are not Resend test addresses: maya@client.test. Send to delivered@resend.dev (or bounced@ / complained@resend.dev), or unset EMAIL_TEST_MODE to send real mail.",
    });
  }, SEND_TEST_TIMEOUT_MS);

  it("reschedules a 429 while the notification stays queued, then gives up after the last attempt", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    resend.sdkResult = {
      data: null,
      error: { name: "rate_limit_exceeded", message: "Too many requests", statusCode: 429 },
    };
    const t = makeTest();
    const notification = await enqueueQuoteReady(t);
    const notificationId = notification._id;

    await t.action(internal.email.send.sendQueuedEmail, { notificationId });

    expect((await t.run(async (ctx) => ctx.db.get(notificationId)))!.status).toBe("queued");
    expect((await scheduledSends(t)).find((s) => s.args.attempt === 1)).toMatchObject({
      delayMs: 30_000,
    });

    await t.action(internal.email.send.sendQueuedEmail, { notificationId, attempt: 3 });

    expect(await t.run(async (ctx) => ctx.db.get(notificationId))).toMatchObject({
      status: "failed",
      error:
        "[Resend] rate_limit_exceeded (HTTP 429): Too many requests (gave up after 4 attempts)",
    });
    expect((await scheduledSends(t)).some((s) => s.args.attempt === 4)).toBe(false);
  }, SEND_TEST_TIMEOUT_MS);
});

describe("sendQueuedEmail for a staff reply", () => {
  async function queueReply(attachQuote: boolean, name = "Jamie Park") {
    const t = makeTest();
    const { requestId } = await seedBooking(t);
    const user = await createUser(t, { email: "jamie@arbor.st", name });
    const arbor = await createOrg(t, { type: "arbor_internal" });
    await addMembership(t, user._id, arbor.organizationId, "member", true);
    await setActiveOrg(t, user._id, arbor.organizationId);
    await setVerticals(t, user._id, ["Operations"]);
    await asUser(t, user).mutation(api.emailThreads.sendReply, {
      requestId,
      body: "Quote attached.\nThanks!",
      attachQuote,
      clientRequestId: "attempt-1",
    });
    const notification = await queuedNotification(t, "booking_reply");
    await t.action(internal.email.send.sendQueuedEmail, { notificationId: notification._id });
    return { t, notification };
  }

  it("attaches the current quote PDF and records the reply on the thread", async () => {
    const { t, notification } = await queueReply(true);

    expect(resend.componentSends).toHaveLength(0);
    expect(resend.sdkSends).toHaveLength(1);
    const [send] = resend.sdkSends;
    expect(send!.options).toEqual({ idempotencyKey: `emailNotifications:${notification._id}` });
    expect(send!.payload).toMatchObject({
      from: '"Jamie Park at Arbor Live" <bookings@arbor.st>',
      to: "maya@client.test",
      subject: "Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)",
      replyTo: ["alreq-aaaaaaa@arbor.st"],
      attachments: [expect.objectContaining({ filename: "ALINV-BBBBBBB.pdf" })],
    });
    expect(send!.payload.html).toContain("<span>Quote attached.</span><span><br/>Thanks!</span>");
    const outbound = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    expect(outbound.map((m) => [m.direction, m.fromName, m.attachments])).toEqual([
      ["outbound", "Jamie Park at Arbor Live", [{ filename: "ALINV-BBBBBBB.pdf" }]],
    ]);
    expect(outbound[0]!.bodyText).toContain("Message from Jamie Park");
    expect(outbound[0]!.bodyText).not.toContain("MESSAGE FROM");
  }, SEND_TEST_TIMEOUT_MS);

  it("goes through the component without an attachment when the reply does not ask for the quote", async () => {
    await queueReply(false);

    expect(resend.sdkSends).toHaveLength(0);
    expect(resend.componentSends).toHaveLength(1);
    expect(resend.componentSends[0]).toMatchObject({
      from: '"Jamie Park at Arbor Live" <bookings@arbor.st>',
      to: "maya@client.test",
    });
  }, SEND_TEST_TIMEOUT_MS);

  it("sends from plain Arbor Live when the sender has no name, and records the same name", async () => {
    const { t } = await queueReply(false, "");

    expect(resend.componentSends).toHaveLength(1);
    const [send] = resend.componentSends;
    expect(send!.from).toBe('"Arbor Live" <bookings@arbor.st>');
    const html = send!.html as string;
    expect(html).not.toContain("Message from");
    const [message] = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    expect(message).toMatchObject({ direction: "outbound", fromName: "Arbor Live" });
    expect(message!.bodyText).not.toContain("Message from");
    expect(message!.bodyText.startsWith("Quote attached.\nThanks!\n\nArbor Live\n\nOpen your request tracker")).toBe(
      true,
    );
  }, SEND_TEST_TIMEOUT_MS);
});
