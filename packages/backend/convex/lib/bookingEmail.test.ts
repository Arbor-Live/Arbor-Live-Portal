// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { enqueueEmail } from "../email/enqueue";
import { scheduleQuoteApprovedEmail } from "../email/quoteApprovedEmails";
import { seedEvent, seedInvoice, seedRequest } from "../test/bookingSeeds.helpers";
import { makeTest, type Test } from "../test/setup.helpers";
import {
  bookingSenderFrom,
  buildThreadReferences,
  replySubject,
  resolveBookingEmail,
  threadHeaderFields,
} from "./bookingEmail";

describe("sender and subject helpers", () => {
  it("names the manager, else just Arbor Live", () => {
    expect(bookingSenderFrom("Rory Manager")).toBe('"Rory Manager at Arbor Live" <bookings@arbor.st>');
    expect(bookingSenderFrom(undefined)).toBe('"Arbor Live" <bookings@arbor.st>');
  });

  it("strips characters that would break the From header", () => {
    expect(bookingSenderFrom('Rory "Rip" <Manager>')).toBe(
      '"Rory Rip Manager at Arbor Live" <bookings@arbor.st>',
    );
  });

  it("prefixes Re: once", () => {
    expect(replySubject("Arbor Live booking: Gala (ALREQ-AAAAAAA)")).toBe(
      "Re: Arbor Live booking: Gala (ALREQ-AAAAAAA)",
    );
    expect(replySubject("Re: Arbor Live booking: Gala (ALREQ-AAAAAAA)")).toBe(
      "Re: Arbor Live booking: Gala (ALREQ-AAAAAAA)",
    );
  });

  it("replies to the newest id and references the last 20 in order", () => {
    const ids = Array.from({ length: 25 }, (_, i) => `m${i + 1}@x.test`);
    const { inReplyTo, references } = buildThreadReferences(ids);
    expect(inReplyTo).toBe("m25@x.test");
    expect(references).toHaveLength(20);
    expect(references[0]).toBe("m6@x.test");
    expect(references[19]).toBe("m25@x.test");
    expect(buildThreadReferences([])).toEqual({ inReplyTo: undefined, references: [] });
  });

  it("wraps the ids in angle brackets for the headers, and sends none for an empty thread", () => {
    expect(
      threadHeaderFields({
        inReplyTo: "reply1@client.test",
        references: ["out1@email.resend.com", "reply1@client.test"],
      }),
    ).toEqual({
      "In-Reply-To": "<reply1@client.test>",
      References: "<out1@email.resend.com> <reply1@client.test>",
    });
    expect(threadHeaderFields({ references: [] })).toEqual({});
  });
});

async function resolve(t: Test, ref: Parameters<typeof resolveBookingEmail>[1]["ref"], key = "k1") {
  return await t.run(async (ctx) => resolveBookingEmail(ctx, { ref, idempotencyKey: key }));
}

describe("resolveBookingEmail", () => {
  it("uses the request number for the subject and Reply-To when there is a request", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
    const invoiceId = await seedInvoice(t, {
      invoiceNumber: "ALINV-BBBBBBB",
      sourceEventRequestId: requestId,
    });
    await t.run(async (ctx) =>
      ctx.db.patch(requestId, { linkedInvoiceId: invoiceId, eventName: "Winter Gala" }),
    );

    const fromInvoice = await resolve(t, { invoiceId });

    expect(fromInvoice).toMatchObject({
      from: '"Alex Manager at Arbor Live" <bookings@arbor.st>',
      replyTo: ["alreq-aaaaaaa@arbor.st"],
      subject: "Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)",
    });
    const fromRequest = await resolve(t, { requestId });
    expect(fromRequest.emailThreadId).toBe(fromInvoice.emailThreadId);
  });

  it("falls back to the invoice number when the booking has no request", async () => {
    const t = makeTest();
    const invoiceId = await seedInvoice(t, { invoiceNumber: "ALINV-CCCCCCC" });
    await t.run(async (ctx) => ctx.db.patch(invoiceId, { clientGroupName: "Stanford Jazz" }));

    const envelope = await resolve(t, { invoiceId });

    expect(envelope.replyTo).toEqual(["alinv-ccccccc@arbor.st"]);
    expect(envelope.subject).toBe("Arbor Live booking: Stanford Jazz (ALINV-CCCCCCC)");
  });

  it("falls back to the invoice number for a legacy request with no number", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, {});
    const invoiceId = await seedInvoice(t, {
      invoiceNumber: "ALINV-DDDDDDD",
      sourceEventRequestId: requestId,
    });
    await t.run(async (ctx) => ctx.db.patch(requestId, { linkedInvoiceId: invoiceId }));

    const envelope = await resolve(t, { requestId });

    expect(envelope.replyTo).toEqual(["alinv-ddddddd@arbor.st"]);
    expect(envelope.subject).toBe("Arbor Live booking: Your event (ALINV-DDDDDDD)");
  });

  it("sends the first message as-is and prefixes later ones with Re:, keeping the first subject", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
    await t.run(async (ctx) => ctx.db.patch(requestId, { eventName: "Winter Gala" }));

    const first = await resolve(t, { requestId }, "first");
    expect(first.subject).toBe("Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)");

    await t.run(async (ctx) =>
      enqueueEmail(ctx, {
        template: "booking_request_received",
        to: "maya@client.test",
        ...first,
        idempotencyKey: "first",
        payload: {},
      }),
    );
    // Re-resolving the first email (a retry) is still the first message.
    expect((await resolve(t, { requestId }, "first")).subject).toBe(first.subject);

    await t.run(async (ctx) => ctx.db.patch(requestId, { eventName: "Renamed Gala" }));
    const second = await resolve(t, { requestId }, "second");
    expect(second.subject).toBe("Re: Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)");
    expect(second.emailThreadId).toBe(first.emailThreadId);
  });

  it("starts with Re: when the client wrote first", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
    const { emailThreadId } = await resolve(t, { requestId });
    await t.run(async (ctx) => ctx.db.patch(emailThreadId, { messageCount: 1 }));

    expect((await resolve(t, { requestId }, "later")).subject).toBe(
      "Re: Arbor Live booking: Your event (ALREQ-AAAAAAA)",
    );
  });
});

describe("staff-facing emails", () => {
  it("keep the default sender, subject and no thread", async () => {
    const t = makeTest();
    const invoiceId = await seedInvoice(t, { invoiceNumber: "ALINV-EEEEEEE" });
    await t.run(async (ctx) =>
      ctx.db.patch(invoiceId, { managerEmail: "alex@arbor.test", totalUsd: 1200 }),
    );
    await seedEvent(t, { invoiceId });

    await t.run(async (ctx) => {
      const invoice = (await ctx.db.get(invoiceId))!;
      await scheduleQuoteApprovedEmail(ctx, { invoice, approvedAt: 1 });
    });

    const [row] = await t.run(async (ctx) => ctx.db.query("emailNotifications").collect());
    expect(row).toMatchObject({
      template: "quote_approved",
      to: "alex@arbor.test",
      subject: "Quote approved: Winter Showcase",
    });
    expect(row!.emailThreadId).toBeUndefined();
    expect(row!.from).toBeUndefined();
    expect(row!.replyTo).toBeUndefined();
    expect(await t.run(async (ctx) => ctx.db.query("emailThreads").collect())).toHaveLength(0);
  });
});
