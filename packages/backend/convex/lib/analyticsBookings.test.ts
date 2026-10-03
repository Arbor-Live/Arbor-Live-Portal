import { describe, expect, it } from "vitest";
import type { Doc } from "../_generated/dataModel";
import { eventNetProfitUsd, isBookedInvoice, type EventBooking } from "./analyticsBookings";

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
