import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { captureDayTemplates, listGroupDays } from "./eventGroupTemplates";
import { isMultiDayGroup, isRecurringGroup } from "./eventGroupKind";
import { listEventsByInvoiceId } from "./invoiceEvents";

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

async function findMultiDayGroupForInvoice(
  ctx: QueryCtx | MutationCtx,
  invoiceId: Id<"invoices">,
) {
  const groups = await ctx.db
    .query("eventSeries")
    .withIndex("by_invoiceId", (q) => q.eq("invoiceId", invoiceId))
    .take(10);
  return groups.find((group) => isMultiDayGroup(group)) ?? null;
}

/** Drop an event's group membership fields (a `patch` cannot unset them). */
export async function releaseFromGroup(ctx: MutationCtx, eventId: Id<"events">, now: number) {
  const event = await ctx.db.get(eventId);
  if (!event || event.seriesId === undefined) return;
  const next = { ...event, updatedAt: now };
  delete next.seriesId;
  delete next.occurrenceIndex;
  delete next.seriesDetached;
  await ctx.db.replace(eventId, next);
}

/** Create a multi-day group for an invoice's days, with templates from Day 1. */
async function createMultiDayGroup(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  days: readonly Doc<"events">[],
  now: number,
): Promise<Doc<"eventSeries">> {
  const first = days[0]!;
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
  const captured = await captureDayTemplates(
    ctx,
    first,
    { schedule: true, crew: true, positions: true },
    now,
  );
  await ctx.db.patch(groupId, { ...captured, updatedAt: now });
  const group = await ctx.db.get(groupId);
  if (!group) throw new Error("Event group not found.");
  return group;
}

/**
 * Keep an invoice's multi-day group in step with its days: create it once the
 * invoice has two days, add/remove members, and order days by date. Returns
 * the group id, or null when the invoice has no multi-day group.
 */
export async function syncMultiDayGroupForInvoice(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  now: number,
): Promise<Id<"eventSeries"> | null> {
  const days = await listEventsByInvoiceId(ctx, invoiceId);
  let group = await findMultiDayGroupForInvoice(ctx, invoiceId);

  for (const seriesId of new Set(days.flatMap((day) => (day.seriesId ? [day.seriesId] : [])))) {
    if (seriesId === group?._id) continue;
    const other = await ctx.db.get(seriesId);
    // A recurring series bills through this invoice: its days are its own.
    if (other && isRecurringGroup(other)) return null;
  }

  if (days.length < 2) {
    // One day is a plain event again. The group row (and its templates) stays
    // on the invoice, so linking a second day picks it back up.
    for (const day of days) {
      if (day.seriesId) await releaseFromGroup(ctx, day._id, now);
    }
    if (group) {
      for (const member of await listGroupDays(ctx, group._id)) {
        await releaseFromGroup(ctx, member._id, now);
      }
    }
    return null;
  }
  if (!group) {
    group = await createMultiDayGroup(ctx, invoiceId, days, now);
  }

  const plan = planMultiDayMembership(group._id, days, await listGroupDays(ctx, group._id));
  for (const eventId of plan.release) {
    await releaseFromGroup(ctx, eventId, now);
  }
  for (const row of plan.assign) {
    await ctx.db.patch(row.eventId, {
      seriesId: group._id,
      occurrenceIndex: row.occurrenceIndex,
      seriesDetached: row.seriesDetached,
      updatedAt: now,
    });
  }

  // Templates are relative to each day's start; the anchor is Day 1, which the
  // template editors use to show clock times.
  const first = days[0];
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
