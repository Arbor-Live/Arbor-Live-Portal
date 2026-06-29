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

  const assignments = await ctx.db
    .query("eventPeopleAssignments")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of assignments) {
    await ctx.db.delete(row._id);
  }

  const artifacts = await ctx.db
    .query("eventArtifacts")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(TAKE);
  for (const row of artifacts) {
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
}

export async function unlinkRequestPeers(ctx: MutationCtx, request: Doc<"eventRequests">) {
  if (request.linkedInvoiceId) {
    const invoice = await ctx.db.get(request.linkedInvoiceId);
    if (invoice?.sourceEventRequestId === request._id) {
      await ctx.db.patch(request.linkedInvoiceId, {
        sourceEventRequestId: undefined,
        updatedAt: Date.now(),
      });
    }
  }
}
