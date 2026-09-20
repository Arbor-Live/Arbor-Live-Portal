import { v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { formatDate, formatDateTime, formatTime, pacificDateKey } from "@arbor/format";
import {
  allocateEventPatch,
  buildNightRiderDocument,
  fileStem,
  type ShowBandInput,
} from "@arbor/show-file";
import type { EventBriefAssignment, EventBriefDocumentData } from "@arbor/rider-document";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { findAuthUsersByIds, requireArborInternalContext, requireAuth } from "./lib/auth";
import {
  buildBandContacts,
  listManualEventContacts,
  manualContactToBriefContact,
  resolveInvoiceContact,
  resolveVenueContact,
} from "./lib/eventContacts";
import { loadEventHostDisplay } from "./lib/hostOrgs";
import { eventDashboardUrl } from "./email/constants";

const STATUS_LABELS: Record<string, string> = {
  tentative: "Tentative",
  logistics: "Logistics",
  scheduling: "Scheduling",
  ready: "Ready",
  cancelled: "Cancelled",
  draft: "Draft",
  active: "Active",
  completed: "Completed",
};

/** Markdown is authored for the web; the brief prints plain text. */
function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/[*_`>]/g, "")
    .replace(/\[(.+?)\]\((.+?)\)/g, "$1 ($2)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function whenLabel(startAt: number, endAt: number, timezone: string): string {
  const start = formatTime(startAt, timezone);
  const end = formatTime(endAt, timezone);
  if (pacificDateKey(startAt, timezone) === pacificDateKey(endAt, timezone)) {
    return `${formatDate(startAt, timezone)} · ${start} – ${end}`;
  }
  return `${formatDate(startAt, timezone)} ${start} – ${formatDate(endAt, timezone)} ${end}`;
}

/** Walks ancestors so a room without its own address prints the building's. */
async function effectiveAddress(
  ctx: QueryCtx,
  venue: Doc<"venues"> | null,
): Promise<string | undefined> {
  let current = venue;
  while (current) {
    if (current.address?.trim()) return current.address;
    current = current.parentId ? await ctx.db.get(current.parentId) : null;
  }
  return undefined;
}

/**
 * Event manager and day-of lead are stored as user ids on the event. The brief
 * prints their name and contact, so resolve them the same way email does.
 */
async function leadAssignments(
  ctx: QueryCtx,
  event: Doc<"events">,
): Promise<EventBriefAssignment[]> {
  const roles: Array<{ userId?: string; roleLabel: string }> = [
    { userId: event.eventManagerUserId, roleLabel: "Event manager" },
    { userId: event.dayOfLeadUserId, roleLabel: "Day-of lead" },
  ];
  const userByKey = await findAuthUsersByIds(
    ctx,
    roles.map((role) => role.userId).filter((id): id is string => Boolean(id?.trim())),
  );
  return roles.flatMap(({ userId, roleLabel }) => {
    if (!userId?.trim()) return [];
    const user = userByKey.get(userId);
    return [
      {
        roleLabel,
        person: user?.name?.trim() || user?.email?.trim() || "Assigned",
        contact: user?.email?.trim() || undefined,
      },
    ];
  });
}

/** Gate for the public brief download (any Arbor staff, incl. crew). */
export const checkAccess = query({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    return null;
  },
});

/**
 * Gathers everything the brief needs, with no user identity, so both the
 * on-demand download and the scheduled print action share one code path.
 */
export const getBriefSource = internalQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<EventBriefDocumentData | null> => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;

    const venue = event.venueId ? await ctx.db.get(event.venueId) : null;
    const [blocks, shifts, artifacts, pullListItems] = await Promise.all([
      ctx.db
        .query("eventScheduleBlocks")
        .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
        .take(500),
      ctx.db
        .query("eventCrewShifts")
        .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
        .take(500),
      ctx.db
        .query("eventArtifacts")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(500),
      ctx.db
        .query("eventPullListItems")
        .withIndex("by_eventId_and_sortOrder", (q) => q.eq("eventId", args.eventId))
        .take(500),
    ]);

    const rows: FunctionReturnType<typeof internal.bandRiders.listForEventInternal> =
      await ctx.runQuery(internal.bandRiders.listForEventInternal, {
        eventId: args.eventId,
      });

    const venueContact = await resolveVenueContact(ctx, venue);
    const invoiceContact = await resolveInvoiceContact(ctx, event.hostGroupId);
    const manualContacts = await listManualEventContacts(ctx, args.eventId);
    const hostDisplay = await loadEventHostDisplay(ctx, event);
    const contacts: EventBriefDocumentData["contacts"] = [
      ...(venueContact ? [venueContact] : []),
      ...(invoiceContact ? [invoiceContact] : []),
      ...buildBandContacts(rows),
      ...manualContacts.map(manualContactToBriefContact),
    ];

    const bands: ShowBandInput[] = rows
      .filter((row) => row.rider && row.rider.inputs.length > 0)
      .map((row) => ({
        bandName: row.bandName,
        fileStem: fileStem(row.bandName),
        role: row.role,
        inputs: row.rider!.inputs,
        stage: row.rider!.stage,
        items: row.rider!.items,
        monitorMixes: row.rider!.monitorMixes,
        backline: row.rider!.backline,
      }));

    let nightRider: EventBriefDocumentData["nightRider"];
    if (bands.length > 0) {
      const allocation = allocateEventPatch(bands, event.patchPlan ?? undefined);
      nightRider = {
        ...buildNightRiderDocument({ eventName: event.title, allocation, bands }),
        bandName: event.title,
        riderName: "Band inputs & changeover",
      };
    }

    const instructions = artifacts
      .filter(
        (artifact) =>
          (artifact.artifactType === "instruction" || artifact.artifactType === "note") &&
          artifact.active &&
          artifact.markdown?.trim(),
      )
      .map((artifact) => ({
        title: artifact.title,
        body: stripMarkdown(artifact.markdown!),
      }));

    return {
      title: event.title,
      generatedAtLabel: formatDateTime(Date.now()),
      statusLabel: STATUS_LABELS[event.status] ?? event.status,
      eventTypeLabel: event.eventType ?? undefined,
      hostLabel: hostDisplay.hostLabel,
      whenLabel: whenLabel(event.startAt, event.endAt, event.timezone),
      venueName: event.venueName ?? venue?.name,
      venueAddress: await effectiveAddress(ctx, venue),
      notes: event.notes ?? undefined,
      briefUrl: eventDashboardUrl(String(event._id)),
      blocks: blocks.map((block) => ({
        dayLabel: `Day ${block.dayIndex + 1}`,
        label: block.label,
        timeLabel: `${formatTime(block.startsAt, event.timezone)} – ${formatTime(block.endsAt, event.timezone)}`,
        notes: block.notes ?? undefined,
      })),
      shifts: shifts.map((shift) => ({
        role: shift.role,
        person: shift.personName ?? "Unassigned",
        timeLabel: `${formatTime(shift.startsAt, event.timezone)} – ${formatTime(shift.endsAt, event.timezone)}`,
        notes: shift.notes ?? undefined,
      })),
      assignments: await leadAssignments(ctx, event),
      contacts,
      pullList: pullListItems.map((item) => ({
        label: item.label,
        quantity: item.quantityRequired,
        notes: item.notes ?? undefined,
      })),
      instructions,
      nightRider,
    };
  },
});
