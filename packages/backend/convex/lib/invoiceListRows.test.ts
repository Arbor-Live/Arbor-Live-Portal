import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import {
  computeInvoiceListLabels,
  computeInvoiceListPaymentStatus,
  inferredSeriesIdForEvents,
  invoiceListNeedsPaymentProof,
  type InvoiceListEvent,
  type InvoiceListGroup,
} from "./invoiceListRows";

function event(
  partial: Partial<InvoiceListEvent> & { _id: string },
): InvoiceListEvent {
  return {
    _creationTime: 0,
    title: "Show",
    startAt: 0,
    endAt: 0,
    timezone: "America/Los_Angeles",
    ...partial,
  } as InvoiceListEvent;
}

function group(partial: Partial<InvoiceListGroup> = {}): InvoiceListGroup {
  return { title: "Spring Series", kind: "recurring", ...partial } as InvoiceListGroup;
}

type PaymentInvoice = Parameters<typeof computeInvoiceListPaymentStatus>[0]["invoice"];

function invoice(overrides: Partial<PaymentInvoice> = {}): PaymentInvoice {
  return {
    approvedAt: 1,
    clientApprovalStatus: "approved",
    ...overrides,
  } as PaymentInvoice;
}

describe("inferredSeriesIdForEvents", () => {
  it("returns the single shared series id", () => {
    const seriesId = "series1" as Id<"eventSeries">;
    expect(
      inferredSeriesIdForEvents([
        { seriesId },
        { seriesId },
        { seriesId: undefined },
      ]),
    ).toBe(seriesId);
  });

  it("returns null for zero, mixed, or missing series ids", () => {
    expect(inferredSeriesIdForEvents([])).toBeNull();
    expect(inferredSeriesIdForEvents([{ seriesId: undefined }])).toBeNull();
    expect(
      inferredSeriesIdForEvents([
        { seriesId: "a" as Id<"eventSeries"> },
        { seriesId: "b" as Id<"eventSeries"> },
      ]),
    ).toBeNull();
  });
});

describe("computeInvoiceListLabels", () => {
  it("prefers the directly linked recurring series title", () => {
    const linkedEvents = [
      event({ _id: "e1" as Id<"events">, title: "Day 1", seriesId: "s1" as Id<"eventSeries"> }),
    ];
    const labels = computeInvoiceListLabels({
      series: group({ title: "Direct" }),
      inferredSeries: group({ title: "Inferred" }),
      linkedEvents,
    });
    expect(labels.seriesTitle).toBe("Direct");
  });

  it("falls back to the inferred recurring series for ungrouped links", () => {
    const labels = computeInvoiceListLabels({
      series: null,
      inferredSeries: group({ title: "Inferred" }),
      linkedEvents: [event({ _id: "e1" as Id<"events"> })],
    });
    expect(labels.seriesTitle).toBe("Inferred");
  });

  it("ignores a non-recurring inferred group", () => {
    const labels = computeInvoiceListLabels({
      series: null,
      inferredSeries: group({ kind: "multi_day" }),
      linkedEvents: [event({ _id: "e1" as Id<"events"> })],
    });
    expect(labels.seriesTitle).toBeUndefined();
  });

  it("sums event costs and pass-through from the first linked event", () => {
    const labels = computeInvoiceListLabels({
      series: null,
      inferredSeries: null,
      linkedEvents: [
        event({
          _id: "e1" as Id<"events">,
          title: "Day 1",
          crewCostUsd: 100,
          bandsCostUsd: 40,
          externalRentalsCostUsd: 10,
          otherCostUsd: 5,
        }),
        event({ _id: "e2" as Id<"events">, title: "Day 2", crewCostUsd: 999 }),
      ],
    });
    expect(labels.primaryEvent?._id).toBe("e1");
    expect(labels.linkedEventTitle).toBe("Day 1");
    expect(labels.eventCostsUsd).toBe(155);
    expect(labels.eventPassThroughCostsUsd).toBe(50);
  });

  it("returns null costs and no titles without linked events", () => {
    const labels = computeInvoiceListLabels({
      series: null,
      inferredSeries: null,
      linkedEvents: [],
    });
    expect(labels.primaryEvent).toBeUndefined();
    expect(labels.linkedEventTitle).toBeUndefined();
    expect(labels.eventCostsUsd).toBeNull();
    expect(labels.eventPassThroughCostsUsd).toBeNull();
  });
});

describe("computeInvoiceListPaymentStatus", () => {
  const nowMs = Date.UTC(2026, 7, 20, 12, 0, 0);

  it("returns null for quotes that are not approved", () => {
    expect(
      computeInvoiceListPaymentStatus({
        invoice: invoice({ clientApprovalStatus: undefined }),
        primaryEvent: undefined,
        hasActiveSubmission: false,
        nowMs,
      }),
    ).toEqual({ paymentStatus: null, daysOverdue: 0 });
  });

  it("returns paid once money landed", () => {
    expect(
      computeInvoiceListPaymentStatus({
        invoice: invoice({ paymentReceivedAt: nowMs - 1 }),
        primaryEvent: undefined,
        hasActiveSubmission: true,
        nowMs,
      }),
    ).toEqual({ paymentStatus: "paid", daysOverdue: 0 });
  });

  it("stays an estimate before the event ends and finalizes after", () => {
    const future = { endAt: nowMs + 1000, timezone: "America/Los_Angeles" };
    const past = { endAt: nowMs - 1000, timezone: "America/Los_Angeles" };
    expect(
      computeInvoiceListPaymentStatus({
        invoice: invoice(),
        primaryEvent: future,
        hasActiveSubmission: false,
        nowMs,
      }),
    ).toEqual({ paymentStatus: "estimate", daysOverdue: 0 });
    expect(
      computeInvoiceListPaymentStatus({
        invoice: invoice(),
        primaryEvent: past,
        hasActiveSubmission: false,
        nowMs,
      }),
    ).toEqual({ paymentStatus: "ready_to_finalize", daysOverdue: 0 });
  });

  it("is an estimate without a primary event until payment opens", () => {
    expect(
      computeInvoiceListPaymentStatus({
        invoice: invoice(),
        primaryEvent: undefined,
        hasActiveSubmission: false,
        nowMs,
      }),
    ).toEqual({ paymentStatus: "estimate", daysOverdue: 0 });
  });

  it("counts days overdue past the due-day end", () => {
    // 2026-08-01 PDT: due day ends 2026-08-02T07:00Z (see invoiceDueEndMs).
    const result = computeInvoiceListPaymentStatus({
      invoice: invoice({
        billingFinalizedAt: Date.UTC(2026, 6, 1),
        dueDate: "2026-08-01",
      }),
      primaryEvent: undefined,
      hasActiveSubmission: false,
      nowMs,
    });
    // 2026-08-20T12:00Z is 18.2 days past the boundary -> 19 days overdue.
    expect(result).toEqual({ paymentStatus: "overdue", daysOverdue: 19 });
  });

  it("reports proof_received vs payment_pending after payment opens", () => {
    const opened = invoice({ billingFinalizedAt: Date.UTC(2026, 6, 1) });
    expect(
      computeInvoiceListPaymentStatus({
        invoice: opened,
        primaryEvent: undefined,
        hasActiveSubmission: true,
        nowMs,
      }),
    ).toEqual({ paymentStatus: "proof_received", daysOverdue: 0 });
    expect(
      computeInvoiceListPaymentStatus({
        invoice: opened,
        primaryEvent: undefined,
        hasActiveSubmission: false,
        nowMs,
      }),
    ).toEqual({ paymentStatus: "payment_pending", daysOverdue: 0 });
  });

  it("accepts a submitted proof even when payment never opened", () => {
    expect(
      computeInvoiceListPaymentStatus({
        invoice: invoice(),
        primaryEvent: undefined,
        hasActiveSubmission: true,
        nowMs,
      }),
    ).toEqual({ paymentStatus: "proof_received", daysOverdue: 0 });
  });
});

describe("invoiceListNeedsPaymentProof", () => {
  it("is only true for approved quotes without payment received", () => {
    expect(invoiceListNeedsPaymentProof(invoice())).toBe(true);
    expect(invoiceListNeedsPaymentProof(invoice({ clientApprovalStatus: undefined }))).toBe(false);
    expect(invoiceListNeedsPaymentProof(invoice({ paymentReceivedAt: 1 }))).toBe(false);
  });
});

// Compile-time guard: the payment helper's invoice pick covers every field
// `getPaymentProofOpensAt` reads.
const _paymentProofInvoiceCheck: Pick<
  Doc<"invoices">,
  "approvedAt" | "clientApprovalStatus" | "billingFinalizedAt" | "paymentOpenedEarlyAt"
> = invoice();
void _paymentProofInvoiceCheck;
