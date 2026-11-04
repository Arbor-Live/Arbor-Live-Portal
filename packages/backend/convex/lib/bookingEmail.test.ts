// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { enqueueEmail } from "../email/enqueue";
import { deleteInvoiceRecord } from "./bookingChainDelete";
import { schedulePayingPartyAddedEmail } from "../email/payingPartyEmails";
import { scheduleQuoteApprovedEmail } from "../email/quoteApprovedEmails";
import { seedEvent, seedInvoice, seedRequest } from "../test/bookingSeeds.helpers";
import { createUser, makeTest, type Test } from "../test/setup.helpers";
import type { BookingRef } from "./emailThreads";
import {
  bookingSenderFrom,
  buildThreadReferences,
  previewBookingEmail,
  replySubject,
  resolveBookingEmail,
  threadHeaders,
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

  it("references the thread's root plus the last 9 ids, and replies to the newest", () => {
    const recent = Array.from({ length: 15 }, (_, i) => `m${i + 11}@x.test`);
    expect(buildThreadReferences({ root: "m1@x.test", recent })).toEqual({
      inReplyTo: "m25@x.test",
      references: [
        "m1@x.test",
        "m17@x.test",
        "m18@x.test",
        "m19@x.test",
        "m20@x.test",
        "m21@x.test",
        "m22@x.test",
        "m23@x.test",
        "m24@x.test",
        "m25@x.test",
      ],
    });
  });

  it("lists a short thread once, root included", () => {
    expect(
      buildThreadReferences({ root: "m1@x.test", recent: ["m1@x.test", "m2@x.test"] }),
    ).toEqual({ inReplyTo: "m2@x.test", references: ["m1@x.test", "m2@x.test"] });
    expect(buildThreadReferences({ recent: [] })).toEqual({ inReplyTo: undefined, references: [] });
  });

  it("wraps the ids in angle brackets for the headers, and sends none for an empty thread", () => {
    expect(
      threadHeaders({
        inReplyTo: "reply1@client.test",
        references: ["out1@email.resend.com", "reply1@client.test"],
      }),
    ).toEqual([
      { name: "In-Reply-To", value: "<reply1@client.test>" },
      { name: "References", value: "<out1@email.resend.com> <reply1@client.test>" },
    ]);
    expect(threadHeaders({ references: [] })).toEqual([]);
  });
});

async function resolve(t: Test, ref: BookingRef) {
  return await t.run(async (ctx) =>
    resolveBookingEmail(ctx, { ref }, { to: "maya@client.test" }),
  );
}

async function enqueueBookingEmail(t: Test, ref: BookingRef, idempotencyKey: string) {
  return await t.run(async (ctx) => {
    const id = await enqueueEmail(ctx, {
      template: "booking_request_received",
      to: "maya@client.test",
      booking: { ref },
      idempotencyKey,
      payload: {},
    });
    return (await ctx.db.get(id!))!;
  });
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
      booking: { from: '"Alex Manager at Arbor Live" <bookings@arbor.st>' },
      replyTo: ["alreq-aaaaaaa@arbor.st"],
      subject: "Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)",
    });
    const fromRequest = await resolve(t, { requestId });
    expect(fromRequest.booking.threadId).toBe(fromInvoice.booking.threadId);
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

  it("skips an invoice number that can't route back and replies to the event address", async () => {
    const t = makeTest();
    const invoiceId = await seedInvoice(t, { invoiceNumber: "ALINV-2024_17" });
    const eventId = await seedEvent(t, { invoiceId });

    const envelope = await resolve(t, { invoiceId });

    expect(envelope.replyTo).toEqual([`alevt-${eventId.toLowerCase()}@arbor.st`]);
  });

  it("replies to the bookings inbox when nothing on the booking can route", async () => {
    const t = makeTest();
    const invoiceId = await seedInvoice(t, { invoiceNumber: "ALINV-2024_18" });

    expect((await resolve(t, { invoiceId })).replyTo).toEqual(["bookings@arbor.st"]);
  });

  it("sends the first email as-is and later ones as Re: the stored subject, even after a rename", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
    await t.run(async (ctx) => ctx.db.patch(requestId, { eventName: "Winter Gala" }));

    const first = await enqueueBookingEmail(t, { requestId }, "first");
    expect(first.subject).toBe("Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)");
    const thread = await t.run(async (ctx) => ctx.db.get(first.booking!.threadId));
    expect(thread!.subject).toBe("Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)");

    await t.run(async (ctx) => ctx.db.patch(requestId, { eventName: "Renamed Gala" }));
    const second = await enqueueBookingEmail(t, { requestId }, "second");
    expect(second.subject).toBe("Re: Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)");
    expect(second.booking!.threadId).toBe(first.booking!.threadId);
  });

  it("keeps the first subject when the first email is retried after failing", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
    const first = await enqueueBookingEmail(t, { requestId }, "first");
    await t.run(async (ctx) => ctx.db.patch(first._id, { status: "failed" }));

    const retried = await enqueueBookingEmail(t, { requestId }, "first");

    expect(retried).toMatchObject({
      status: "queued",
      subject: "Arbor Live booking: Your event (ALREQ-AAAAAAA)",
    });
  });

  it("starts with Re: when the client wrote first, and stores the subject without it", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
    const threadId = await t.run(async (ctx) =>
      ctx.db.insert("emailThreads", {
        requestId,
        lastMessageAt: 1,
        messageCount: 1,
        createdAt: 1,
      }),
    );

    expect((await resolve(t, { requestId })).subject).toBe(
      "Re: Arbor Live booking: Your event (ALREQ-AAAAAAA)",
    );
    expect((await t.run(async (ctx) => ctx.db.get(threadId)))!.subject).toBe(
      "Arbor Live booking: Your event (ALREQ-AAAAAAA)",
    );
  });
});

describe("booking email CC", () => {
  it("copies only Arbor Live before the booking has a quote", async () => {
    const t = makeTest();
    const assignee = await createUser(t, { name: "Rory Assignee", email: "rory@arbor.test" });
    const requestId = await seedRequest(t, {
      requestNumber: "ALREQ-AAAAAAA",
      assigneeUserId: assignee._id,
    });

    const email = await enqueueBookingEmail(t, { requestId }, "before-quote");

    expect(email.cc).toEqual(["arborlive@stanford.edu"]);
  });

  it("copies the quote's manager as well once the booking has a quote", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
    const invoiceId = await seedInvoice(t, {
      invoiceNumber: "ALINV-BBBBBBB",
      sourceEventRequestId: requestId,
    });
    await t.run(async (ctx) =>
      ctx.db.patch(invoiceId, { managerEmail: "Alex.Manager@arbor.test" }),
    );

    const email = await enqueueBookingEmail(t, { requestId }, "after-quote");

    expect(email.cc).toEqual(["arborlive@stanford.edu", "alex.manager@arbor.test"]);
  });

  it("finds the manager's email from their account when the quote has none", async () => {
    const t = makeTest();
    const manager = await createUser(t, { name: "Sam Manager", email: "sam@arbor.test" });
    const invoiceId = await seedInvoice(t, {
      invoiceNumber: "ALINV-BBBBBBB",
      managerUserId: manager._id,
    });

    const email = await enqueueBookingEmail(t, { invoiceId }, "account-email");

    expect(email.cc).toEqual(["arborlive@stanford.edu", "sam@arbor.test"]);
  });

  it("follows a re-created quote's manager after the first quote is deleted", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
    const firstQuote = await seedInvoice(t, {
      invoiceNumber: "ALINV-BBBBBBB",
      sourceEventRequestId: requestId,
    });
    await t.run(async (ctx) => ctx.db.patch(firstQuote, { managerEmail: "first@arbor.test" }));
    await enqueueBookingEmail(t, { requestId }, "first-quote");

    await t.run(async (ctx) => deleteInvoiceRecord(ctx, firstQuote));
    const secondQuote = await seedInvoice(t, {
      invoiceNumber: "ALINV-CCCCCCC",
      sourceEventRequestId: requestId,
    });
    await t.run(async (ctx) => ctx.db.patch(secondQuote, { managerEmail: "second@arbor.test" }));

    expect(
      (await t.run(async (ctx) => previewBookingEmail(ctx, { requestId }, "maya@client.test"))).cc,
    ).toEqual(["arborlive@stanford.edu", "second@arbor.test"]);
    const email = await enqueueBookingEmail(t, { requestId }, "second-quote");
    expect(email.cc).toEqual(["arborlive@stanford.edu", "second@arbor.test"]);
    const [thread] = await t.run(async (ctx) => ctx.db.query("emailThreads").collect());
    expect(thread!.invoiceId).toBe(secondQuote);
  });

  it("follows a replacement quote while the old one is still stored", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
    const oldQuote = await seedInvoice(t, {
      invoiceNumber: "ALINV-BBBBBBB",
      sourceEventRequestId: requestId,
    });
    await t.run(async (ctx) => {
      await ctx.db.patch(oldQuote, { managerEmail: "old@arbor.test" });
      await ctx.db.patch(requestId, { linkedInvoiceId: oldQuote });
    });
    await enqueueBookingEmail(t, { requestId }, "old-quote");

    const newQuote = await seedInvoice(t, { invoiceNumber: "ALINV-CCCCCCC" });
    await t.run(async (ctx) => {
      await ctx.db.patch(newQuote, { managerEmail: "new@arbor.test" });
      await ctx.db.patch(requestId, { linkedInvoiceId: newQuote });
    });

    const email = await enqueueBookingEmail(t, { requestId }, "new-quote");

    expect(email.cc).toEqual(["arborlive@stanford.edu", "new@arbor.test"]);
    const [thread] = await t.run(async (ctx) => ctx.db.query("emailThreads").collect());
    expect(thread!.invoiceId).toBe(oldQuote);
  });

  it("copies the manager's account email when the quote's address is not one", async () => {
    const t = makeTest();
    const manager = await createUser(t, { name: "Sam Manager", email: "sam@arbor.test" });
    const invoiceId = await seedInvoice(t, {
      invoiceNumber: "ALINV-BBBBBBB",
      managerUserId: manager._id,
    });
    await t.run(async (ctx) => ctx.db.patch(invoiceId, { managerEmail: "Sam <sam@arbor" }));

    const email = await enqueueBookingEmail(t, { invoiceId }, "bad-manager-email");

    expect(email.cc).toEqual(["arborlive@stanford.edu", "sam@arbor.test"]);
  });

  it("previews the CC without the recipient", async () => {
    const t = makeTest();
    const invoiceId = await seedInvoice(t, { invoiceNumber: "ALINV-BBBBBBB" });
    await t.run(async (ctx) => ctx.db.patch(invoiceId, { managerEmail: "Maya@client.test" }));

    const preview = await t.run(async (ctx) =>
      previewBookingEmail(ctx, { invoiceId }, "maya@client.test"),
    );

    expect(preview.cc).toEqual(["arborlive@stanford.edu"]);
  });

  it("keeps the caller's CCs and never copies the recipient", async () => {
    const t = makeTest();
    const invoiceId = await seedInvoice(t, { invoiceNumber: "ALINV-BBBBBBB" });
    await t.run(async (ctx) => ctx.db.patch(invoiceId, { managerEmail: "maya@client.test" }));

    const email = await t.run(async (ctx) => {
      const id = await enqueueEmail(ctx, {
        template: "booking_request_received",
        to: "maya@client.test",
        cc: ["Colleague@client.test", "arborlive@stanford.edu"],
        booking: { ref: { invoiceId } },
        idempotencyKey: "caller-cc",
        payload: {},
      });
      return (await ctx.db.get(id!))!;
    });

    expect(email.cc).toEqual(["colleague@client.test", "arborlive@stanford.edu"]);
  });
});

describe("previewBookingEmail", () => {
  it("shows the first subject without creating a thread, then Re: once one exists", async () => {
    const t = makeTest();
    const requestId = await seedRequest(t, { requestNumber: "ALREQ-AAAAAAA" });
    const invoiceId = await seedInvoice(t, {
      invoiceNumber: "ALINV-BBBBBBB",
      sourceEventRequestId: requestId,
    });
    await t.run(async (ctx) =>
      ctx.db.patch(requestId, { linkedInvoiceId: invoiceId, eventName: "Winter Gala" }),
    );

    const preview = () =>
      t.run(async (ctx) => previewBookingEmail(ctx, { invoiceId }, "maya@client.test"));
    expect(await preview()).toEqual({
      from: '"Alex Manager at Arbor Live" <bookings@arbor.st>',
      replyTo: "alreq-aaaaaaa@arbor.st",
      cc: ["arborlive@stanford.edu"],
      subject: "Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)",
    });
    expect(await t.run(async (ctx) => ctx.db.query("emailThreads").collect())).toHaveLength(0);

    await enqueueBookingEmail(t, { requestId }, "first");
    expect((await preview()).subject).toBe(
      "Re: Arbor Live booking: Winter Gala (ALREQ-AAAAAAA)",
    );
  });
});

describe("in-app titles", () => {
  it("paying_party_added keeps its sentence in the bell while the email uses the booking subject", async () => {
    const t = makeTest();
    await createUser(t, { email: "payer@client.test", name: "Pat Payer" });
    const invoiceId = await seedInvoice(t, { invoiceNumber: "ALINV-FFFFFFF" });
    await seedEvent(t, { invoiceId });

    await t.run(async (ctx) => {
      const invoice = (await ctx.db.get(invoiceId))!;
      await schedulePayingPartyAddedEmail(ctx, {
        invoice,
        payingPartyEmail: "payer@client.test",
        approvedByName: "Maya Rivera",
        idempotencySuffix: "1",
      });
    });

    const [email] = await t.run(async (ctx) => ctx.db.query("emailNotifications").collect());
    expect(email!.subject).toBe("Arbor Live booking: Winter Showcase (ALINV-FFFFFFF)");
    const [bell] = await t.run(async (ctx) => ctx.db.query("notifications").collect());
    expect(bell!.title).toBe("You've been added as the paying party: Winter Showcase");
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
    expect(row!.booking).toBeUndefined();
    expect(row!.replyTo).toBeUndefined();
    expect(await t.run(async (ctx) => ctx.db.query("emailThreads").collect())).toHaveLength(0);
  });
});
