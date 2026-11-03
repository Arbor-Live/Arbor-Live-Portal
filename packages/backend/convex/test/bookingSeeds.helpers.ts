// Test-only (second dot keeps Convex from bundling it): minimal booking rows
// for the email-thread tests.
import type { Id } from "../_generated/dataModel";
import type { Test } from "./setup.helpers";

const NOW = Date.UTC(2026, 10, 3, 18);

export async function seedRequest(
  t: Test,
  opts: {
    requestNumber?: string;
    email?: string;
    assigneeUserId?: string;
    linkedInvoiceId?: Id<"invoices">;
  } = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("eventRequests", {
      status: "submitted",
      requestNumber: opts.requestNumber,
      firstName: "Maya",
      lastName: "Rivera",
      email: opts.email ?? "maya@client.test",
      phone: "6505550100",
      sponsorType: "Large Voluntary Student Organization",
      eventDateText: "2026-12-01",
      eventStartTimeText: "18:00",
      eventEndTimeText: "22:00",
      earliestSetupText: "2 hours before",
      eventCategory: "Concert / Showcase",
      servicesNeeded: ["Sound"],
      expectedTurnout: 80,
      assigneeUserId: opts.assigneeUserId,
      linkedInvoiceId: opts.linkedInvoiceId,
      submittedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );
}

export async function seedInvoice(
  t: Test,
  opts: {
    invoiceNumber: string;
    managerUserId?: string;
    sourceEventRequestId?: Id<"eventRequests">;
    clientEmail?: string;
  },
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("invoices", {
      invoiceNumber: opts.invoiceNumber,
      status: "draft",
      issueDate: "2026-11-03",
      managerUserId: opts.managerUserId ?? "manager",
      managerName: "Alex Manager",
      clientEmail: opts.clientEmail ?? "maya@client.test",
      sourceEventRequestId: opts.sourceEventRequestId,
      equipmentPricingMode: "subsidized",
      crewRateMode: "normal",
      discountType: "amount",
      discountValue: 0,
      discountAmountUsd: 0,
      equipmentSubtotalUsd: 0,
      externalRentalsSubtotalUsd: 0,
      artistsSubtotalUsd: 0,
      crewSubtotalUsd: 0,
      feesSubtotalUsd: 0,
      subtotalUsd: 0,
      totalUsd: 0,
      clientApprovalStatus: "pending",
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );
}

export async function seedEvent(
  t: Test,
  opts: {
    invoiceId?: Id<"invoices">;
    sourceEventRequestId?: Id<"eventRequests">;
    eventManagerUserId?: string;
  } = {},
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("events", {
      title: "Winter Showcase",
      status: "ready",
      visibility: "internal",
      invoiceId: opts.invoiceId,
      sourceEventRequestId: opts.sourceEventRequestId,
      eventManagerUserId: opts.eventManagerUserId,
      startAt: NOW + 86_400_000,
      endAt: NOW + 86_400_000 + 4 * 3_600_000,
      timezone: "America/Los_Angeles",
      spansMultipleDays: false,
      setupOnly: false,
      strikeOnly: false,
      requiresShowWindow: false,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );
}
