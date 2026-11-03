// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { scheduleBookingRequestReceivedEmail } from "./bookingRequestEmails";
import { seedRequest } from "../test/bookingSeeds.helpers";
import { makeTest } from "../test/setup.helpers";

const sentWithResend = vi.hoisted(() => [] as Array<Record<string, unknown>>);

vi.mock("@convex-dev/resend", () => ({
  Resend: class {
    async sendEmailManually(
      _ctx: unknown,
      _options: unknown,
      send: (emailId: string) => Promise<string>,
    ) {
      await send("component-email-1");
      return "component-email-1";
    }
    async sendEmail() {
      throw new Error("booking emails must use the manual send");
    }
  },
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (email: Record<string, unknown>) => {
        sentWithResend.push(email);
        return { data: { id: "re_live_123" }, error: null };
      },
    };
  },
}));

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  sentWithResend.length = 0;
});

describe("sendQueuedEmail for a booking email", () => {
  it("records the outbound message under Resend's id, not the component's", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("SITE_URL", "http://localhost:3000");
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
    await t.run(async (ctx) =>
      ctx.db.patch(requestId, { eventName: "Winter Gala", publicToken: "tok" }),
    );
    const { notificationId, threadId } = await t.run(async (ctx) => {
      await scheduleBookingRequestReceivedEmail(ctx, (await ctx.db.get(requestId))!);
      const row = (await ctx.db.query("emailNotifications").collect()).find(
        (notification) => notification.template === "booking_request_received",
      )!;
      await ctx.db.insert("emailMessages", {
        threadId: row.emailThreadId,
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
      });
      return { notificationId: row._id, threadId: row.emailThreadId! };
    });

    await t.action(internal.email.send.sendQueuedEmail, { notificationId });

    expect(sentWithResend).toHaveLength(1);
    expect(sentWithResend[0]).toMatchObject({
      from: '"Arbor Live" <bookings@arbor.st>',
      replyTo: ["alreq-aaaaaaa@arbor.st"],
      headers: {
        "In-Reply-To": "<client-1@gmail.test>",
        References: "<client-1@gmail.test>",
        "Idempotency-Key": "component-email-1",
      },
    });
    const notification = await t.run(async (ctx) => ctx.db.get(notificationId));
    expect(notification).toMatchObject({ status: "sent", resendId: "component-email-1" });
    const outbound = await t.run(async (ctx) =>
      (await ctx.db.query("emailMessages").collect()).filter(
        (message) => message.direction === "outbound",
      ),
    );
    expect(outbound.map((message) => [message.threadId, message.resendEmailId])).toEqual([
      [threadId, "re_live_123"],
    ]);
  });
});
