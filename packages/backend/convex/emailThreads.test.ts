// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import {
  findThreadForBooking,
  getOrCreateThreadForBooking,
  resolveBookingRefs,
} from "./lib/emailThreads";
import { seedEvent, seedInvoice, seedRequest } from "./test/bookingSeeds.helpers";
import { makeTest } from "./test/setup.helpers";

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
