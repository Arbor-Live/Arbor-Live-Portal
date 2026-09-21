import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { listEventsByInvoiceId } from "./invoiceEvents";

const TAKE = 500;

export async function findRequestForInvoice(
  ctx: QueryCtx | MutationCtx,
  invoiceId: Id<"invoices">,
): Promise<Doc<"eventRequests"> | null> {
  const byLinkedInvoice = await ctx.db
    .query("eventRequests")
    .withIndex("by_linkedInvoiceId", (q) => q.eq("linkedInvoiceId", invoiceId))
    .unique();
  if (byLinkedInvoice) return byLinkedInvoice;

  const invoice = await ctx.db.get(invoiceId);
  if (!invoice?.sourceEventRequestId) return null;
  return await ctx.db.get(invoice.sourceEventRequestId);
}

export async function deleteInvoiceRecord(ctx: MutationCtx, invoiceId: Id<"invoices">) {
  const lineItems = await ctx.db
    .query("invoiceLineItems")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(TAKE);
  for (const row of lineItems) {
    await ctx.db.delete(row._id);
  }

  const exports = await ctx.db
    .query("invoiceExports")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(TAKE);
  for (const row of exports) {
    await ctx.db.delete(row._id);
  }

  const feedback = await ctx.db
    .query("eventFeedback")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(TAKE);
  for (const row of feedback) {
    await ctx.db.delete(row._id);
  }

  const transitions = await ctx.db
    .query("statusTransitions")
    .withIndex("by_entityType_and_entityId", (q) =>
      q.eq("entityType", "invoice").eq("entityId", String(invoiceId)),
    )
    .take(TAKE);
  for (const row of transitions) {
    await ctx.db.delete(row._id);
  }

  await ctx.db.delete(invoiceId);
}

export async function deleteEventRecord(ctx: MutationCtx, eventId: Id<"events">) {
  const shifts = await ctx.db
    .query("eventCrewShifts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of shifts) {
    await ctx.db.delete(row._id);
  }

  const expenseReports = await ctx.db
    .query("eventExpenseReports")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of expenseReports) {
    await ctx.db.delete(row._id);
  }

  const scheduleBlocks = await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of scheduleBlocks) {
    await ctx.db.delete(row._id);
  }

  const artifacts = await ctx.db
    .query("eventArtifacts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of artifacts) {
    await ctx.db.delete(row._id);
  }

  const contacts = await ctx.db
    .query("eventContacts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of contacts) {
    await ctx.db.delete(row._id);
  }

  const availability = await ctx.db
    .query("eventCrewAvailabilityResponses")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of availability) {
    await ctx.db.delete(row._id);
  }

  const pullListItems = await ctx.db
    .query("eventPullListItems")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of pullListItems) {
    await ctx.db.delete(row._id);
  }

  const emailNotifications = await ctx.db
    .query("emailNotifications")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of emailNotifications) {
    await ctx.db.delete(row._id);
  }

  const bandParticipations = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of bandParticipations) {
    await ctx.db.delete(row._id);
  }

  const bandPayments = await ctx.db
    .query("eventBandPayments")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of bandPayments) {
    await ctx.db.delete(row._id);
  }

  const feedback = await ctx.db
    .query("eventFeedback")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of feedback) {
    await ctx.db.delete(row._id);
  }

  const postMortems = await ctx.db
    .query("postMortemFeedback")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of postMortems) {
    await ctx.db.delete(row._id);
  }

  const paymentProofs = await ctx.db
    .query("eventPaymentProofSubmissions")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of paymentProofs) {
    await ctx.db.delete(row._id);
  }

  const rentalFulfillments = await ctx.db
    .query("eventRentalFulfillments")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of rentalFulfillments) {
    await ctx.db.delete(row._id);
  }

  const rentalUnits = await ctx.db
    .query("eventRentalUnits")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of rentalUnits) {
    await ctx.db.delete(row._id);
  }

  const marketingDesigns = await ctx.db
    .query("eventMarketingDesigns")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of marketingDesigns) {
    await ctx.db.delete(row._id);
  }

  const crewMediaStatuses = await ctx.db
    .query("eventCrewMediaStatus")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of crewMediaStatuses) {
    await ctx.db.delete(row._id);
  }

  const openMicSignups = await ctx.db
    .query("openMicSignups")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of openMicSignups) {
    await ctx.db.delete(row._id);
  }

  const printJobs = await ctx.db
    .query("printJobs")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of printJobs) {
    await ctx.db.delete(row._id);
  }

  const eventIdString = String(eventId);

  const albumLinks = await ctx.db
    .query("immichAlbumLinks")
    .withIndex("by_entityType_and_entityId", (q) =>
      q.eq("entityType", "event").eq("entityId", eventIdString),
    )
    .take(TAKE);
  for (const row of albumLinks) {
    await ctx.db.delete(row._id);
  }

  const transitions = await ctx.db
    .query("statusTransitions")
    .withIndex("by_entityType_and_entityId", (q) =>
      q.eq("entityType", "event").eq("entityId", eventIdString),
    )
    .take(TAKE);
  for (const row of transitions) {
    await ctx.db.delete(row._id);
  }

  const comments = await ctx.db
    .query("comments")
    .withIndex("by_subject_and_createdAt", (q) =>
      q.eq("subjectType", "event").eq("subjectId", eventIdString),
    )
    .take(TAKE);
  for (const row of comments) {
    await ctx.db.delete(row._id);
  }

  const shortLinks = await ctx.db
    .query("shortLinks")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of shortLinks) {
    await ctx.db.delete(row._id);
  }

  await ctx.db.delete(eventId);
}

export async function unlinkInvoicePeers(ctx: MutationCtx, invoiceId: Id<"invoices">) {
  const request = await findRequestForInvoice(ctx, invoiceId);
  if (request?.linkedInvoiceId === invoiceId) {
    await ctx.db.patch(request._id, {
      linkedInvoiceId: undefined,
      updatedAt: Date.now(),
    });
  }

  const events = await listEventsByInvoiceId(ctx, invoiceId);
  const now = Date.now();
  for (const event of events) {
    await ctx.db.patch(event._id, { invoiceId: undefined, updatedAt: now });
  }

  const seriesRows = await ctx.db
    .query("eventSeries")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(10);
  for (const series of seriesRows) {
    await ctx.db.patch(series._id, { invoiceId: undefined, updatedAt: now });
  }
}

export async function unlinkRequestPeers(ctx: MutationCtx, request: Doc<"eventRequests">) {
  const now = Date.now();
  if (request.linkedInvoiceId) {
    const invoice = await ctx.db.get(request.linkedInvoiceId);
    if (invoice?.sourceEventRequestId === request._id) {
      await ctx.db.patch(request.linkedInvoiceId, {
        sourceEventRequestId: undefined,
        updatedAt: now,
      });
    }
  }

  const events = await ctx.db
    .query("events")
    .withIndex("by_sourceEventRequestId", (q) => q.eq("sourceEventRequestId", request._id))
    .take(TAKE);
  for (const event of events) {
    await ctx.db.patch(event._id, { sourceEventRequestId: undefined, updatedAt: now });
  }
}
