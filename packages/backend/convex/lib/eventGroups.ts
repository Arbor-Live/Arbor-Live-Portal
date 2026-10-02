import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { captureDayTemplates, listGroupDays } from "./eventGroupTemplates";
import { isMultiDayGroup, isRecurringGroup } from "./eventGroupKind";
import { assertValidPositionTemplates } from "./eventSeriesPositions";

/**
 * Multi-day groups: a booking's days are the events that share one primary
 * invoice (`events.invoiceId`). The group mirrors that set, so every path that
 * adds or removes a day from an invoice calls `syncMultiDayGroupForInvoice`,
 * and the day order (`occurrenceIndex`) always follows the calendar.
 *
 * Recurring series own their invoice's days, so an invoice with any recurring
 * occurrence (or days from several groups) is left alone.
 */

const DAY_TITLE_SEPARATOR = " — ";

/**
 * The group's name from its days' titles. Multi-day conversions title each day
 * "<base> — <date>"; when every day shares that base, the base is the name.
 */
export function groupTitleFromDayTitles(titles: readonly string[]): string {
  const first = titles[0]?.trim() ?? "";
  if (titles.length < 2) return first;
  const bases = titles.map((title) => {
    const at = title.lastIndexOf(DAY_TITLE_SEPARATOR);
    return at > 0 ? title.slice(0, at).trim() : title.trim();
  });
  const base = bases[0]!;
  return base && bases.every((candidate) => candidate === base) ? base : first;
}

export type MembershipDay = {
  _id: Id<"events">;
  seriesId?: Id<"eventSeries">;
  occurrenceIndex?: number;
  seriesDetached?: boolean;
};

export type MembershipPlan = {
  /** Days to point at the group, with their calendar position. */
  assign: Array<{ eventId: Id<"events">; occurrenceIndex: number; seriesDetached: boolean }>;
  /** Former members that are no longer on the invoice. */
  release: Id<"events">[];
};

/**
 * Pure: bring the group's membership in line with the invoice's days
 * (`days` already in calendar order). Only changed rows are listed.
 */
export function planMultiDayMembership(
  groupId: Id<"eventSeries">,
  days: readonly MembershipDay[],
  currentMembers: readonly MembershipDay[],
): MembershipPlan {
  const onInvoice = new Set(days.map((day) => day._id));
  const release = currentMembers
    .filter((member) => !onInvoice.has(member._id))
    .map((member) => member._id);
  const assign: MembershipPlan["assign"] = [];
  days.forEach((day, occurrenceIndex) => {
    const alreadyMember = day.seriesId === groupId;
    // Joining a group starts attached; a member keeps its override.
    const seriesDetached = alreadyMember ? (day.seriesDetached ?? false) : false;
    if (alreadyMember && day.occurrenceIndex === occurrenceIndex) return;
    assign.push({ eventId: day._id, occurrenceIndex, seriesDetached });
  });
  return { assign, release };
}

/** Return the first multi-day group among up to 10 invoice-linked groups, or null. */
export async function findMultiDayGroupForInvoice(
  ctx: QueryCtx | MutationCtx,
  invoiceId: Id<"invoices">,
) {
  const groups = await ctx.db
    .query("eventSeries")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    // An invoice has at most one booking group; a few stale rows is the worst case.
    .take(10);
  return groups.find((group) => isMultiDayGroup(group)) ?? null;
}

/**
 * Drop an event's group membership fields (`replace`, so the fields are gone
 * rather than left behind by a partial write). Membership is bookkeeping, not an edit: `updatedAt` is left alone so the
 * public calendar's LAST-MODIFIED and print freshness don't churn.
 */
export async function releaseFromGroup(ctx: MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  if (!event || event.seriesId === undefined) return;
  const next = { ...event };
  delete next.seriesId;
  delete next.occurrenceIndex;
  delete next.seriesDetached;
  await ctx.db.replace(eventId, next);
}

/** Days that count toward being a booking: cancelled days don't. */
function activeDays(days: readonly Doc<"events">[]) {
  return days.filter((day) => day.status !== "cancelled");
}

/**
 * Create a multi-day group for an invoice's days. Shared fields and templates
 * come from the first day that isn't cancelled, or the first day if all are
 * cancelled; callers must provide at least one day in calendar order.
 * Template capture, validation, and save errors are caught, leaving the group
 * without saved templates. Capture may stamp position keys on the source day.
 * Throws if the newly created group cannot be read back; other database errors
 * outside template capture and saving propagate.
 */
async function createMultiDayGroup(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  days: readonly Doc<"events">[],
  now: number,
): Promise<Doc<"eventSeries">> {
  const first = activeDays(days)[0] ?? days[0]!;
  const groupId = await ctx.db.insert("eventSeries", {
    kind: "multi_day",
    title: groupTitleFromDayTitles(days.map((day) => day.title)),
    status: "active",
    anchorStartAt: first.startAt,
    anchorEndAt: first.endAt,
    timezone: first.timezone,
    requiresShowWindow: first.requiresShowWindow,
    venueId: first.venueId,
    venueName: first.venueName,
    eventType: first.eventType,
    teamsInterested: first.teamsInterested,
    category: first.category,
    hostGroupId: first.hostGroupId,
    host: first.host,
    additionalHostGroupIds: first.additionalHostGroupIds,
    expectedTurnout: first.expectedTurnout,
    dayOfLeadUserId: first.dayOfLeadUserId,
    eventManagerUserId: first.eventManagerUserId,
    operationsLeadUserId: first.operationsLeadUserId,
    rentalFulfillmentMode: first.rentalFulfillmentMode,
    invoiceId,
    createdAt: now,
    updatedAt: now,
  });
  // Derive the template from Day 1, so "apply to all days" starts from what
  // the booking already looks like. Nothing on any day changes here.
  try {
    // Capture reads everything before it writes anything, so a refusal below
    // leaves no partial stamps behind.
    const captured = await captureDayTemplates(
      ctx,
      first,
      { schedule: true, crew: true, positions: true },
      now,
    );
    assertValidPositionTemplates(captured.positionTemplates ?? []);
    await ctx.db.patch(groupId, { ...captured, updatedAt: now });
  } catch (error) {
    // Grouping must not fail on an unusually large Day 1 (the migration runs
    // over every invoice). The booking forms without templates; staff build
    // them on the group page, and no day changes either way.
    console.warn(
      `Booking group for invoice ${invoiceId} formed without templates: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const group = await ctx.db.get(groupId);
  if (!group) throw new Error("Event group not found.");
  return group;
}

/**
 * Most days one booking can have. `listEventsByInvoiceId` stops at 50, which a
 * long residency can exceed, so the sync reads the invoice itself; past this
 * cap it leaves the booking as it is rather than reshaping a partial view.
 */
const MAX_BOOKING_DAYS = 200;

async function listBookingDays(ctx: MutationCtx, invoiceId: Id<"invoices">) {
  const rows = await ctx.db
    .query("events")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(MAX_BOOKING_DAYS + 1);
  return rows.sort((a, b) => a.startAt - b.startAt || a._creationTime - b._creationTime);
}

/** Release every day of a multi-day group and delete it with its pull-list template. */
async function deleteMultiDayGroup(ctx: MutationCtx, groupId: Id<"eventSeries">) {
  for (const member of await listGroupDays(ctx, groupId)) {
    await releaseFromGroup(ctx, member._id);
  }
  const templateItems = await ctx.db
    .query("eventSeriesPullListItems")
    .withIndex("by_seriesId", (q) => q.eq("seriesId", groupId))
    .take(500);
  for (const item of templateItems) {
    await ctx.db.delete(item._id);
  }
  await ctx.db.delete(groupId);
}

/**
 * Keep an invoice's multi-day group in step with its days:
 * - it forms once the invoice has two days that aren't cancelled;
 * - once formed, cancelled days stay members (so un-cancelling needs no
 *   regrouping and a day's override survives);
 * - it is deleted (days released) when fewer than two days remain on the invoice;
 * - days are ordered by date.
 * Membership changes preserve event `updatedAt`; new members start attached,
 * and existing members keep their override. `now` is Unix milliseconds for
 * group and template timestamps. Initial template capture is best effort:
 * capture, validation, and save errors leave the new group without templates.
 *
 * Returns the group id, or null if no group remains or a day belongs to a
 * recurring series (which leaves the invoice unchanged). More than 200 days
 * also leaves the invoice unchanged and returns its existing group id or null.
 */
export async function syncMultiDayGroupForInvoice(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  now: number,
): Promise<Id<"eventSeries"> | null> {
  const days = await listBookingDays(ctx, invoiceId);
  let group = await findMultiDayGroupForInvoice(ctx, invoiceId);
  if (days.length > MAX_BOOKING_DAYS) {
    console.warn(
      `Invoice ${invoiceId} has more than ${MAX_BOOKING_DAYS} days; its booking group is left unchanged.`,
    );
    return group?._id ?? null;
  }

  for (const seriesId of new Set(days.flatMap((day) => (day.seriesId ? [day.seriesId] : [])))) {
    if (seriesId === group?._id) continue;
    const other = await ctx.db.get(seriesId);
    // A recurring series bills through this invoice: its days are its own.
    if (other && isRecurringGroup(other)) return null;
  }

  if (!group) {
    if (activeDays(days).length < 2) {
      // Not a booking (yet). A day still pointing at another booking's group
      // (it moved here) is a plain event now.
      for (const day of days) {
        if (day.seriesId) await releaseFromGroup(ctx, day._id);
      }
      return null;
    }
    group = await createMultiDayGroup(ctx, invoiceId, days, now);
  } else if (days.length < 2) {
    // One day left: it's a plain event again.
    await deleteMultiDayGroup(ctx, group._id);
    return null;
  }

  const plan = planMultiDayMembership(group._id, days, await listGroupDays(ctx, group._id));
  for (const eventId of plan.release) {
    await releaseFromGroup(ctx, eventId);
  }
  for (const row of plan.assign) {
    await ctx.db.patch(row.eventId, {
      seriesId: group._id,
      occurrenceIndex: row.occurrenceIndex,
      seriesDetached: row.seriesDetached,
    });
  }

  // Templates are relative to each day's start; the anchor is Day 1, which the
  // template editors use to show clock times.
  const first = activeDays(days)[0] ?? days[0];
  if (
    first &&
    (group.anchorStartAt !== first.startAt || group.anchorEndAt !== first.endAt)
  ) {
    await ctx.db.patch(group._id, {
      anchorStartAt: first.startAt,
      anchorEndAt: first.endAt,
      updatedAt: now,
    });
  }
  return group._id;
}

/**
 * The invoice is going away (deleted, or unlinked from its days): its
 * multi-day group has nothing left to mirror. Release the days and delete the
 * group with its pull-list template.
 */
export async function dissolveMultiDayGroupsForInvoice(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
) {
  const groups = await ctx.db
    .query("eventSeries")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(10);
  for (const group of groups) {
    if (isMultiDayGroup(group)) await deleteMultiDayGroup(ctx, group._id);
  }
}

/** Sync each distinct invoice (skipping undefined), e.g. before and after a move. */
export async function syncMultiDayGroupsForInvoices(
  ctx: MutationCtx,
  invoiceIds: ReadonlyArray<Id<"invoices"> | undefined | null>,
  now: number,
) {
  const seen = new Set<Id<"invoices">>();
  for (const invoiceId of invoiceIds) {
    if (!invoiceId || seen.has(invoiceId)) continue;
    seen.add(invoiceId);
    await syncMultiDayGroupForInvoice(ctx, invoiceId, now);
  }
}
