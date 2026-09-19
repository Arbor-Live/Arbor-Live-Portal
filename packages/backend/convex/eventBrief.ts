import { v } from "convex/values";
import type { FunctionReturnType } from "convex/server";
import { formatDate, formatDateTime, formatTime, pacificDateKey } from "@arbor/format";
import {
  allocateEventPatch,
  buildNightRiderDocument,
  fileStem,
  type ShowBandInput,
} from "@arbor/show-file";
import type { EventBriefDocumentData } from "@arbor/rider-document";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalQuery, query, type QueryCtx } from "./_generated/server";
import { requireArborInternalContext, requireAuth } from "./lib/auth";

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

const ASSIGNMENT_LABELS: Record<string, string> = {
  event_manager: "Event manager",
  day_of_lead: "Day-of lead",
  crew: "Crew",
  performer: "Performer",
  support: "Support",
  contact: "Contact",
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

function whenLabel(startAt: number, endAt: number): string {
  const start = formatTime(startAt);
  const end = formatTime(endAt);
  if (pacificDateKey(startAt) === pacificDateKey(endAt)) {
    return `${formatDate(startAt)} · ${start} – ${end}`;
  }
  return `${formatDate(startAt)} ${start} – ${formatDate(endAt)} ${end}`;
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
    const [blocks, shifts, assignments, artifacts] = await Promise.all([
      ctx.db
        .query("eventScheduleBlocks")
        .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
        .take(500),
      ctx.db
        .query("eventCrewShifts")
        .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", args.eventId))
        .take(500),
      ctx.db
        .query("eventPeopleAssignments")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(500),
      ctx.db
        .query("eventArtifacts")
        .withIndex("by_eventId", (q) => q.eq("eventId", args.eventId))
        .take(500),
    ]);

    const rows: FunctionReturnType<typeof internal.bandRiders.listForEventInternal> =
      await ctx.runQuery(internal.bandRiders.listForEventInternal, {
        eventId: args.eventId,
      });

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
      hostLabel: event.host ?? undefined,
      whenLabel: whenLabel(event.startAt, event.endAt),
      venueName: event.venueName ?? venue?.name,
      venueAddress: await effectiveAddress(ctx, venue),
      notes: event.notes ?? undefined,
      blocks: blocks.map((block) => ({
        dayLabel: `Day ${block.dayIndex + 1}`,
        label: block.label,
        timeLabel: `${formatTime(block.startsAt)} – ${formatTime(block.endsAt)}`,
        notes: block.notes ?? undefined,
      })),
      shifts: shifts.map((shift) => ({
        role: shift.role,
        person: shift.personName ?? "Unassigned",
        timeLabel: `${formatTime(shift.startsAt)} – ${formatTime(shift.endsAt)}`,
        notes: shift.notes ?? undefined,
      })),
      assignments: assignments.map((assignment) => ({
        roleLabel:
          assignment.roleLabel?.trim() ||
          ASSIGNMENT_LABELS[assignment.assignmentType] ||
          assignment.assignmentType,
        person: assignment.personName,
        contact: [assignment.contactEmail, assignment.contactPhone]
          .filter((value): value is string => Boolean(value?.trim()))
          .join(" · "),
        notes: assignment.notes ?? undefined,
      })),
      instructions,
      nightRider,
    };
  },
});
