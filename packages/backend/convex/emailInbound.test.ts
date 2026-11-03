// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { internal } from "./_generated/api";
import { seedEvent, seedInvoice, seedRequest } from "./test/bookingSeeds.helpers";
import {
  addMembership,
  createOrg,
  createUser,
  makeTest,
  setVerticals,
  type Test,
} from "./test/setup.helpers";

const RECEIVED_AT = Date.UTC(2026, 10, 3, 18);

function inbound(overrides: Partial<(typeof internal.emailInbound.recordInboundEmail)["_args"]> = {}) {
  return {
    resendEmailId: "re_1",
    messageId: "m1@client.test",
    references: [],
    fromEmail: "maya@client.test",
    fromName: "Maya Rivera",
    to: ["alreq-aaaaaaa@arbor.st"],
    cc: [],
    receivedFor: ["alreq-aaaaaaa@arbor.st"],
    subject: "Re: Your quote",
    text: "Sounds good!\n\nOn Mon, Nov 3, 2026 at 9:00 AM Arbor <noreply@arbor.st> wrote:\n> quote",
    attachments: [],
    receivedAt: RECEIVED_AT,
    ...overrides,
  };
}

async function record(t: Test, email: ReturnType<typeof inbound>) {
  return await t.mutation(internal.emailInbound.recordInboundEmail, email);
}

async function seedBooking(t: Test, staff: { assignee?: string; manager?: string; eventManager?: string } = {}) {
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
  const eventId = await seedEvent(t, {
    invoiceId,
    sourceEventRequestId: requestId,
    eventManagerUserId: staff.eventManager,
  });
  return { requestId, invoiceId, eventId };
}

describe("recordInboundEmail", () => {
  it("stores a message addressed to a request on the booking thread", async () => {
    const t = makeTest();
    const ids = await seedBooking(t);
    expect(await record(t, inbound())).toBe("matched");

    const messages = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      direction: "inbound",
      matchedBy: "address",
      bodyText: "Sounds good!",
      fullText: expect.stringContaining("wrote:"),
      fromEmail: "maya@client.test",
    });
    const thread = await t.run(async (ctx) => ctx.db.get(messages[0]!.threadId!));
    expect(thread).toMatchObject({ ...ids, messageCount: 1, lastMessageAt: RECEIVED_AT });
  });

  it("is idempotent by Resend email id", async () => {
    const t = makeTest();
    await seedBooking(t);
    await record(t, inbound());
    expect(await record(t, inbound())).toBe("duplicate");
    const messages = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    expect(messages).toHaveLength(1);
    const [thread] = await t.run(async (ctx) => ctx.db.query("emailThreads").collect());
    expect(thread!.messageCount).toBe(1);
  });

  it("matches a CC'd invoice address and shares the request's thread", async () => {
    const t = makeTest();
    await seedBooking(t);
    await record(t, inbound());
    await record(
      t,
      inbound({
        resendEmailId: "re_2",
        messageId: "m2@arbor.test",
        fromEmail: "alex@arbor.st",
        to: ["maya@client.test"],
        cc: ["ALINV-bbbbbbb@Arbor.ST"],
        receivedFor: [],
      }),
    );
    const threads = await t.run(async (ctx) => ctx.db.query("emailThreads").collect());
    expect(threads).toHaveLength(1);
    expect(threads[0]!.messageCount).toBe(2);
  });

  it("matches an older invoice whose number has a mixed-case suffix", async () => {
    const t = makeTest();
    const invoiceId = await seedInvoice(t, { invoiceNumber: "ALINV-PwWqpa9" });
    const outcome = await record(
      t,
      inbound({ to: ["alinv-pwwqpa9@arbor.st"], receivedFor: ["alinv-pwwqpa9@arbor.st"] }),
    );
    expect(outcome).toBe("matched");
    const threads = await t.run(async (ctx) => ctx.db.query("emailThreads").collect());
    expect(threads.map((thread) => thread.invoiceId)).toEqual([invoiceId]);
  });

  it("matches an event address and an envelope-only (BCC) address", async () => {
    const t = makeTest();
    const ids = await seedBooking(t);
    await record(t, inbound({ to: ["someone@else.test"], receivedFor: [`alevt-${ids.eventId}@arbor.st`] }));
    const [message] = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    expect(message).toMatchObject({ matchedBy: "address" });
  });

  it("falls back to In-Reply-To / References when no address matches", async () => {
    const t = makeTest();
    await seedBooking(t);
    await record(t, inbound());
    await record(
      t,
      inbound({
        resendEmailId: "re_2",
        messageId: "m2@client.test",
        inReplyTo: "not-ours@x.test",
        references: ["m1@client.test", "not-ours@x.test"],
        to: ["noreply@arbor.st"],
        receivedFor: ["noreply@arbor.st"],
        text: "One more thing",
      }),
    );
    const messages = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    const reply = messages.find((m) => m.resendEmailId === "re_2")!;
    expect(reply.matchedBy).toBe("header");
    expect(reply.threadId).toBe(messages.find((m) => m.resendEmailId === "re_1")!.threadId);
  });

  it("stores mail with no booking address and no known parent as unmatched", async () => {
    const t = makeTest();
    await seedBooking(t);
    expect(
      await record(
        t,
        inbound({
          to: ["alreq-zzzzzzz@arbor.st", "info@arbor.st"],
          receivedFor: ["alreq-zzzzzzz@arbor.st"],
          references: ["unknown@x.test"],
        }),
      ),
    ).toBe("unmatched");
    const [message] = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    expect(message!.threadId).toBeUndefined();
    expect(message!.matchedBy).toBeUndefined();
    expect(await t.run(async (ctx) => ctx.db.query("emailThreads").collect())).toHaveLength(0);
  });

  it("caps stored text and keeps the full message", async () => {
    const t = makeTest();
    await seedBooking(t);
    await record(t, inbound({ text: "x".repeat(30_000) }));
    const [message] = await t.run(async (ctx) => ctx.db.query("emailMessages").collect());
    expect(message!.bodyText).toHaveLength(20_000);
    expect(message!.fullText).toHaveLength(30_000);
  });
});

describe("booking staff notifications", () => {
  it("notifies the assignee, invoice manager and event manager once each", async () => {
    const t = makeTest();
    const assignee = await createUser(t, { email: "assignee@arbor.st" });
    const manager = await createUser(t, { email: "manager@arbor.st" });
    const ids = await seedBooking(t, {
      assignee: assignee._id,
      manager: manager._id,
      eventManager: manager._id,
    });
    await record(t, inbound());

    const rows = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(rows.map((row) => row.userId).sort()).toEqual([assignee._id, manager._id].sort());
    expect(rows[0]).toMatchObject({
      template: "booking_email_received",
      status: "delivered",
      title: "Reply from Maya Rivera",
      body: "Sounds good!",
      path: `/dashboard/ops-center/requests/${ids.requestId}`,
    });
  });

  it("links to the invoice page when the thread has no request", async () => {
    const t = makeTest();
    const manager = await createUser(t, { email: "manager@arbor.st" });
    const invoiceId = await seedInvoice(t, { invoiceNumber: "ALINV-CCCCCCC", managerUserId: manager._id });
    await record(
      t,
      inbound({ fromName: undefined, to: ["alinv-ccccccc@arbor.st"], receivedFor: [] }),
    );
    const [row] = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(row).toMatchObject({
      title: "Reply from maya@client.test",
      path: `/dashboard/ops-center/invoices/${invoiceId}`,
    });
  });

  it("skips a staff member whose own email sent the message", async () => {
    const t = makeTest();
    const manager = await createUser(t, { email: "alex@arbor.st" });
    const assignee = await createUser(t, { email: "sam@arbor.st" });
    await seedBooking(t, { manager: manager._id, assignee: assignee._id });
    await record(t, inbound({ fromEmail: "Alex@Arbor.st", fromName: "Alex" }));
    const rows = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(rows.map((row) => row.userId)).toEqual([assignee._id]);
  });

  it("still stores the reply when a staff id on the booking is not a user", async () => {
    const t = makeTest();
    const assignee = await createUser(t);
    await seedBooking(t, { manager: "e2e-manager", assignee: assignee._id });
    expect(await record(t, inbound())).toBe("matched");
    const rows = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(rows.map((row) => row.userId)).toEqual([assignee._id]);
  });

  it("notifies the Crew portal admins when nobody owns the booking, never a band org admin", async () => {
    const t = makeTest();
    const arbor = await createOrg(t, { type: "arbor_internal" });
    const band = await createOrg(t, { type: "band" });
    const crewAdmin = await createUser(t, { role: "admin", email: "crew-admin@arbor.st" });
    await addMembership(t, crewAdmin._id, arbor.organizationId, "org_admin");
    await setVerticals(t, crewAdmin._id, ["Crew"]);
    const opsAdmin = await createUser(t, { role: "admin", email: "ops-admin@arbor.st" });
    await addMembership(t, opsAdmin._id, arbor.organizationId, "org_admin");
    await setVerticals(t, opsAdmin._id, ["Operations"]);
    const bandAdmin = await createUser(t, { role: "admin", email: "band-admin@band.test" });
    await addMembership(t, bandAdmin._id, band.organizationId, "org_admin");
    await setVerticals(t, bandAdmin._id, ["Crew"]);
    const ids = await seedBooking(t);

    expect(await record(t, inbound())).toBe("matched");

    const rows = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(rows.map((row) => row.userId)).toEqual([crewAdmin._id]);
    expect(rows[0]).toMatchObject({
      template: "booking_email_received",
      title: "Reply from Maya Rivera",
      path: `/dashboard/ops-center/requests/${ids.requestId}`,
    });
  });

  it("does not notify for unmatched mail", async () => {
    const t = makeTest();
    const manager = await createUser(t);
    await seedBooking(t, { manager: manager._id });
    await record(t, inbound({ to: ["info@arbor.st"], receivedFor: ["info@arbor.st"] }));
    expect(await t.run(async (ctx) => ctx.db.query("notifications").collect())).toHaveLength(0);
  });
});
