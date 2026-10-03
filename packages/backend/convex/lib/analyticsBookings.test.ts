import { describe, expect, it } from "vitest";
import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import {
  createInvoiceLoader,
  eventNetProfitUsd,
  isBookedInvoice,
  type EventBooking,
} from "./analyticsBookings";

function event(costs: Partial<Doc<"events">>): Doc<"events"> {
  return { crewCostUsd: 0, bandsCostUsd: 0, externalRentalsCostUsd: 0, otherCostUsd: 0, ...costs } as Doc<"events">;
}

function booking(partial: Partial<EventBooking>): EventBooking {
  return {
    booked: true,
    earnedRevenueUsd: 0,
    passThroughBilledUsd: 0,
    crewBilledUsd: 0,
    invoiceIds: [],
    ...partial,
  };
}

describe("isBookedInvoice", () => {
  it("counts only finalized quotes the client approved", () => {
    const base = { status: "finalized", clientApprovalStatus: "approved" } as Doc<"invoices">;
    expect(isBookedInvoice(base)).toBe(true);
    expect(isBookedInvoice({ ...base, clientApprovalStatus: "pending" })).toBe(false);
    expect(isBookedInvoice({ ...base, status: "draft" } as Doc<"invoices">)).toBe(false);
    expect(isBookedInvoice({ ...base, status: "void" } as Doc<"invoices">)).toBe(false);
    expect(isBookedInvoice(null)).toBe(false);
  });
});

describe("eventNetProfitUsd", () => {
  it("does not subtract pass-through costs the host already paid for", () => {
    // $1,000 earned on equipment/crew; a $300 band billed and paid through.
    const result = eventNetProfitUsd(
      event({ crewCostUsd: 400, bandsCostUsd: 300 }),
      booking({ earnedRevenueUsd: 1000, passThroughBilledUsd: 300 }),
    );
    expect(result).toEqual({ costUsd: 400, netProfitUsd: 600 });
  });

  it("still charges a pass-through overrun against margin", () => {
    const result = eventNetProfitUsd(
      event({ bandsCostUsd: 500 }),
      booking({ earnedRevenueUsd: 1000, passThroughBilledUsd: 300 }),
    );
    expect(result).toEqual({ costUsd: 200, netProfitUsd: 800 });
  });

  it("uses the event's share of a shared invoice", () => {
    // A two-day booking: each day carries half the invoice and its own costs.
    const day = eventNetProfitUsd(event({ crewCostUsd: 250 }), booking({ earnedRevenueUsd: 1200 / 2 }));
    expect(day.netProfitUsd).toBe(350);
  });
});

/** Just enough of `ctx.db` for the loader: `get` and by-invoice index reads. */
function fakeCtx(data: {
  invoice: { _id: string };
  events: Array<{ _id: string; invoiceId?: string; status: string }>;
  links: Array<{ eventId: string; invoiceId: string }>;
}) {
  const byId = new Map<string, unknown>([
    [data.invoice._id, data.invoice],
    ...data.events.map((event) => [event._id, event] as [string, unknown]),
  ]);
  const query = (table: string) => ({
    withIndex: (_index: string, range: (q: { eq: (field: string, value: string) => unknown }) => unknown) => {
      let invoiceId = "";
      range({
        eq: (_field, value) => {
          invoiceId = value;
          return null;
        },
      });
      const rows = table === "events" ? data.events.filter((event) => event.invoiceId === invoiceId) : data.links;
      return { take: async () => rows.filter((row) => !("invoiceId" in row) || row.invoiceId === invoiceId) };
    },
  });
  return { db: { get: async (id: string) => byId.get(id) ?? null, query } } as unknown as QueryCtx;
}

describe("createInvoiceLoader", () => {
  it("counts each event once, primary or extra link, and leaves cancelled ones out of the live split", async () => {
    const ctx = fakeCtx({
      invoice: { _id: "inv" },
      events: [
        { _id: "day1", invoiceId: "inv", status: "ready" },
        { _id: "day2", invoiceId: "inv", status: "cancelled" },
        { _id: "extra", status: "ready" },
        { _id: "extraCancelled", status: "cancelled" },
      ],
      links: [
        { eventId: "day1", invoiceId: "inv" }, // also its primary: counted once
        { eventId: "extra", invoiceId: "inv" },
        { eventId: "extraCancelled", invoiceId: "inv" },
      ],
    });
    const loaded = await createInvoiceLoader(ctx)("inv" as never);
    expect(loaded).toMatchObject({ eventCount: 2, totalEventCount: 4 });
  });

  it("never splits by zero when every event is cancelled", async () => {
    const ctx = fakeCtx({
      invoice: { _id: "inv" },
      events: [
        { _id: "a", invoiceId: "inv", status: "cancelled" },
        { _id: "b", invoiceId: "inv", status: "cancelled" },
      ],
      links: [],
    });
    expect(await createInvoiceLoader(ctx)("inv" as never)).toMatchObject({ eventCount: 1, totalEventCount: 2 });
  });
});
