import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import {
  deleteEventInvoiceLinksForEvent,
  deleteEventInvoiceLinksForInvoice,
} from "./eventInvoiceLinks";
import { listEventsByInvoiceId } from "./invoiceEvents";
import { dissolveMultiDayGroupsForInvoice, syncMultiDayGroupForInvoice } from "./eventGroups";

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
  await dissolveMultiDayGroupsForInvoice(ctx, invoiceId);
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

/**
 * A queued `crew_unscheduled` email still has to go out after its event is
 * deleted, and the cascade wipes the event's emails, so it lets go first. So does
 * its bell mirror, which the cascade leaves behind pointing at nothing.
 */
export async function detachQueuedCrewNotices(ctx: MutationCtx, eventId: Id<"events">) {
  const drainRows = withCascadeBudget();
  await drainRows(
    () =>
      ctx.db
        .query("emailNotifications")
        .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
        .filter((q) => q.and(q.eq(q.field("template"), "crew_unscheduled"), q.eq(q.field("status"), "queued")))
        .take(TAKE),
    async (id) => {
      const email = await ctx.db.get(id);
      await ctx.db.patch(id, { eventId: undefined });
      if (!email) return;
      const mirrors = await ctx.db
        .query("notifications")
        .withIndex("by_dedupeKey", (q) => q.eq("dedupeKey", email.debounceKey ?? email.idempotencyKey))
        .take(TAKE);
      for (const mirror of mirrors) {
        if (mirror.eventId === eventId) await ctx.db.patch(mirror._id, { eventId: undefined });
      }
    },
  );
}

async function deleteHashSidecar(
  ctx: MutationCtx,
  eventId: Id<"events">,
  drainRows: ReturnType<typeof withCascadeBudget>,
) {
  const row = await ctx.db
    .query("hashDates")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .unique();
  if (!row) return;
  await drainRows(
    () =>
      ctx.db
        .query("hashAvailability")
        .withIndex("by_hashDateId_and_userId", (q) => q.eq("hashDateId", row._id))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );
  await drainRows(
    () =>
      ctx.db
        .query("hashChecks")
        .withIndex("by_hashDateId_and_itemKey", (q) => q.eq("hashDateId", row._id))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );
  await drainRows(
    () =>
      ctx.db
        .query("hashAreaClaims")
        .withIndex("by_hashDateId_and_areaId_and_userId", (q) => q.eq("hashDateId", row._id))
        .take(TAKE),
    (id) => ctx.db.delete(id),
  );
  await ctx.db.delete(row._id);
}

export async function deleteEventRecord(
  ctx: MutationCtx,
  eventId: Id<"events">,
  /**
   * A cascade deleting a whole booking dissolves its group once up front
   * (`dissolveMultiDayGroupsForInvoice`) rather than re-syncing per day.
   */
  options: { skipGroupSync?: boolean } = {},
) {
  const drainRows = withCascadeBudget();
  const invoiceId = (await ctx.db.get(eventId))?.invoiceId;
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

  await deleteHashSidecar(ctx, eventId, drainRows);
  await ctx.db.delete(eventId);
  // The booking's remaining days close ranks (or stop being a group).
  if (invoiceId && !options.skipGroupSync && (await ctx.db.get(invoiceId))) {
    await syncMultiDayGroupForInvoice(ctx, invoiceId, Date.now());
  }
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

  // Without the invoice, its days are no longer one booking.
  await dissolveMultiDayGroupsForInvoice(ctx, invoiceId);
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
