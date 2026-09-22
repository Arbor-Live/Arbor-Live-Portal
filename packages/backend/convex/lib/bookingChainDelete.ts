import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  deleteEventInvoiceLinksForEvent,
  deleteEventInvoiceLinksForInvoice,
} from "./eventInvoiceLinks";
import { listEventsByInvoiceId } from "./invoiceEvents";

const TAKE = 500;
/**
 * Upper bound for one cascade, shared across every relation it drains.
 * Convex mutations can write at most 16,000 documents; 5,000 stays under that
 * even after the parent row and the surrounding reads. Hitting it means the
 * data is pathological — fail loudly so the mutation rolls back rather than
 * delete a parent while children remain.
 */
const MAX_CASCADE_ROWS = 5000;

export function recordCascadeRows(budget: { total: number }, rowCount: number): void {
  budget.total += rowCount;
  if (budget.total > MAX_CASCADE_ROWS) {
    throw new Error(
      `Cascade exceeded ${MAX_CASCADE_ROWS} rows (got ${budget.total}); aborting before deleting the parent.`,
    );
  }
}

/**
 * One budget per cascade. `drainRows` pages until each query is exhausted and
 * counts every relation against the same limit — a per-call counter would let
 * several full relations blow past the mutation write limit.
 * `mutate` must remove each row from `fetchPage`'s index (delete it, or patch
 * the indexed field) so the next page advances.
 */
function withCascadeBudget() {
  const budget = { total: 0 };
  return async function drainRows<D extends { _id: Id<TableNames> }>(
    fetchPage: () => Promise<D[]>,
    mutate: (id: D["_id"]) => Promise<void>,
  ): Promise<void> {
    for (;;) {
      const rows = await fetchPage();
      for (const row of rows) {
        await mutate(row._id);
      }
      recordCascadeRows(budget, rows.length);
      if (rows.length < TAKE) return;
    }
  };
}

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
  const drainRows = withCascadeBudget();
  await deleteEventInvoiceLinksForInvoice(ctx, invoiceId);

  await drainRows(
    () =>
      ctx.db
        .query("invoiceLineItems")
        .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("invoiceExports")
        .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventFeedback")
        .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("statusTransitions")
        .withIndex("by_entityType_and_entityId", (q) =>
          q.eq("entityType", "invoice").eq("entityId", String(invoiceId)),
        )
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await ctx.db.delete(invoiceId);
}

export async function deleteEventRecord(ctx: MutationCtx, eventId: Id<"events">) {
  const drainRows = withCascadeBudget();
  await deleteEventInvoiceLinksForEvent(ctx, eventId);

  await drainRows(
    () =>
      ctx.db
        .query("eventCrewShifts")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventExpenseReports")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventScheduleBlocks")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventArtifacts")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventContacts")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventCrewAvailabilityResponses")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventPullListItems")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("emailNotifications")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventBandParticipations")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventBandPayments")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventFeedback")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("postMortemFeedback")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventPaymentProofSubmissions")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventRentalFulfillments")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventRentalUnits")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventMarketingDesigns")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("eventCrewMediaStatus")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("openMicSignups")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("printJobs")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  const eventIdString = String(eventId);

  await drainRows(
    () =>
      ctx.db
        .query("immichAlbumLinks")
        .withIndex("by_entityType_and_entityId", (q) =>
          q.eq("entityType", "event").eq("entityId", eventIdString),
        )
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("statusTransitions")
        .withIndex("by_entityType_and_entityId", (q) =>
          q.eq("entityType", "event").eq("entityId", eventIdString),
        )
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("comments")
        .withIndex("by_subject_and_createdAt", (q) =>
          q.eq("subjectType", "event").eq("subjectId", eventIdString),
        )
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await drainRows(
    () =>
      ctx.db
        .query("shortLinks")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );

  await ctx.db.delete(eventId);
}

export async function unlinkInvoicePeers(ctx: MutationCtx, invoiceId: Id<"invoices">) {
  const drainRows = withCascadeBudget();
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

  await drainRows(
    () =>
      ctx.db
        .query("eventSeries")
        .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
        .take(TAKE),
    (id) => ctx.db.patch(id, { invoiceId: undefined, updatedAt: now }),
  );
}

export async function unlinkRequestPeers(ctx: MutationCtx, request: Doc<"eventRequests">) {
  const drainRows = withCascadeBudget();
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

  await drainRows(
    () =>
      ctx.db
        .query("events")
        .withIndex("by_sourceEventRequestId", (q) => q.eq("sourceEventRequestId", request._id))
        .take(TAKE),
    (id) => ctx.db.patch(id, { sourceEventRequestId: undefined, updatedAt: now }),
  );
}
