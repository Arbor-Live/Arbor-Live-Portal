import type { CrewUnscheduledEmailPayload } from "@arbor/email/types";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  EVENT_TIMEZONE,
  eventDashboardUrl,
  formatEventDateRange,
  subjectForTemplate,
} from "./constants";
import { cancelPendingDebouncedEmail, enqueueDebouncedEmail, enqueueEmail, hasSentDebouncedEmail } from "./enqueue";
import {
  getEventLeadRecipients,
  getEventStakeholderEmails,
  getUserScheduledEmailRecipient,
} from "./recipients";
import {
  buildCrewShiftGroupIcsEvent,
  crewAssigneeKey,
  crewInviteDebounceKey,
  crewInviteUid,
  legacyCrewInviteDebounceKey,
  legacyCrewInviteUid,
  shiftGroupAnchor,
  formatAssignmentSummary,
  formatBlockTimeRange,
  formatScheduleBlockSummary,
  groupShiftsByConsecutiveBlocks,
  shiftGroupBlockLabels,
  shiftGroupFingerprint,
  userCoversEntireSchedule,
  type CrewShiftLike,
} from "./scheduleEmailData";

function buildBasePayload(
  event: {
    _id: Id<"events">;
    title: string;
    venueName?: string;
    startAt: number;
    endAt: number;
    timezone: string;
  },
  recipientName?: string,
) {
  return {
    eventTitle: event.title,
    venueName: event.venueName,
    dateRangeLabel: formatEventDateRange(event.startAt, event.endAt, event.timezone),
    eventUrl: eventDashboardUrl(event._id),
    recipientName,
  };
}

export function scheduleBlocksContentFingerprint(
  blocks: Array<{
    blockType: string;
    label: string;
    dayIndex: number;
    startsAt: number;
    endsAt: number;
    notes?: string;
  }>,
) {
  return [...blocks]
    .map(
      (block) =>
        `${block.blockType}:${block.label.trim()}:${block.dayIndex}:${block.startsAt}:${block.endsAt}:${block.notes?.trim() ?? ""}`,
    )
    .sort()
    .join("|");
}

export async function scheduleEventCancelledEmails(
  ctx: MutationCtx,
  eventId: Id<"events">,
  updatedAt: number,
) {
  const event = await ctx.db.get(eventId);
  if (!event) return;

  const recipients = await getEventStakeholderEmails(ctx, eventId);
  const subject = subjectForTemplate("event_cancelled", event.title);

  for (const recipient of recipients) {
    await enqueueEmail(ctx, {
      template: "event_cancelled",
      to: recipient.email,
      subject,
      eventId,
      idempotencyKey: `event_cancelled:${eventId}:${updatedAt}:${recipient.email}`,
      payload: buildBasePayload(event, recipient.name),
    });
  }
}

export async function scheduleSchedulePublishedEmails(
  ctx: MutationCtx,
  eventId: Id<"events">,
  fingerprint: string,
) {
  const event = await ctx.db.get(eventId);
  if (!event) return;

  const blocks = await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
    .take(500);

  const timezone = event.timezone || EVENT_TIMEZONE;
  const blockSummaries = blocks.map((block) => {
    return `${block.label}: ${formatBlockTimeRange(block.startsAt, block.endsAt, timezone)}`;
  });

  const recipients = await getEventLeadRecipients(ctx, eventId);
  const subject = subjectForTemplate("schedule_published", event.title);

  for (const recipient of recipients) {
    await enqueueDebouncedEmail(ctx, {
      template: "schedule_published",
      to: recipient.email,
      subject,
      eventId,
      debounceKey: `schedule_published:${eventId}:${recipient.email}`,
      idempotencyKey: `schedule_published:${eventId}:${fingerprint}:${recipient.email}`,
      payload: {
        ...buildBasePayload(event, recipient.name),
        blockSummaries,
      },
    });
  }
}

async function resolveCrewAssigneeRecipient(ctx: MutationCtx, assigneeKey: string) {
  if (assigneeKey.startsWith("application:")) {
    const applicationId = assigneeKey.slice("application:".length) as Id<"crewApplications">;
    const application = await ctx.db.get(applicationId);
    if (!application?.email) return null;
    return { email: application.email, name: application.name, userId: undefined };
  }
  return getUserScheduledEmailRecipient(ctx, assigneeKey);
}

/**
 * Crew invites go out one per email (Gmail and Outlook only add the first event
 * of an invite), one per run of back-to-back shifts. Each invite is diffed on
 * its own: changed runs re-send, runs that disappeared get a cancellation.
 */
export async function scheduleCrewScheduledEmails(
  ctx: MutationCtx,
  eventId: Id<"events">,
  previousShifts: CrewShiftLike[],
  nextShifts: CrewShiftLike[],
  inviteSequence: number,
) {
  const event = await ctx.db.get(eventId);
  if (!event) return;

  const timezone = event.timezone || EVENT_TIMEZONE;
  const blocks = await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
    .take(500);
  const blockLabelById = new Map(blocks.map((block) => [block._id, block.label]));
  const fullScheduleSummaries = blocks.map((block) => formatScheduleBlockSummary(block, timezone));
  const eventLeadName = event.dayOfLeadUserId
    ? (await getUserScheduledEmailRecipient(ctx, event.dayOfLeadUserId))?.name
    : undefined;

  const shiftsFor = (shifts: CrewShiftLike[], assigneeKey: string) =>
    shifts.filter((shift) => crewAssigneeKey(shift) === assigneeKey);
  const assigneeKeys = new Set(
    [...previousShifts, ...nextShifts]
      .map(crewAssigneeKey)
      .filter((value): value is string => Boolean(value)),
  );

  for (const assigneeKey of assigneeKeys) {
    const previousAssigneeShifts = shiftsFor(previousShifts, assigneeKey);
    const nextAssigneeShifts = shiftsFor(nextShifts, assigneeKey);
    // No assignment change for this person (debounce still coalesces bursts via debounceKey).
    if (shiftGroupFingerprint(previousAssigneeShifts) === shiftGroupFingerprint(nextAssigneeShifts)) {
      continue;
    }

    const byAnchor = (shifts: CrewShiftLike[]) =>
      new Map(groupShiftsByConsecutiveBlocks(shifts, blocks).map((group) => [shiftGroupAnchor(group), group]));
    const previousGroups = byAnchor(previousAssigneeShifts);
    const nextGroups = byAnchor(nextAssigneeShifts);
    const coversEntireEvent =
      nextGroups.size === 1 && userCoversEntireSchedule(nextAssigneeShifts, blocks);
    const remainingAssignmentSummaries = nextAssigneeShifts.map((shift) =>
      formatAssignmentSummary(shift, blockLabelById, timezone),
    );
    const labelRuns = Math.max(previousGroups.size, nextGroups.size) > 1;
    const to = await resolveCrewAssigneeRecipient(ctx, assigneeKey);
    if (!to) continue;
    const base = { ...buildBasePayload(event, to.name), eventLeadName, timezone };
    const icsEventFor = (uid: string, group: CrewShiftLike[]) =>
      buildCrewShiftGroupIcsEvent({
        uid,
        eventTitle: event.title,
        venueName: event.venueName,
        group,
        blockLabelById,
        timezone,
        sequence: inviteSequence,
      });

    await retireLegacyCrewInvite(ctx, {
      eventId,
      assigneeKey,
      to,
      subjectContext: event.title,
      payload: {
        ...base,
        previousAssignmentSummaries: previousAssigneeShifts.map((shift) =>
          formatAssignmentSummary(shift, blockLabelById, timezone),
        ),
        remainingAssignmentSummaries,
        replacedBySeparateInvites: nextAssigneeShifts.length > 0,
        icsEvent: icsEventFor(
          legacyCrewInviteUid(eventId, assigneeKey),
          previousAssigneeShifts.length > 0 ? previousAssigneeShifts : nextAssigneeShifts,
        ),
      },
    });

    for (const anchor of new Set([...previousGroups.keys(), ...nextGroups.keys()])) {
      const previousGroup = previousGroups.get(anchor) ?? [];
      const nextGroup = nextGroups.get(anchor);
      const scheduledKey = crewInviteDebounceKey("crew_scheduled", eventId, assigneeKey, anchor);
      const unscheduledKey = crewInviteDebounceKey("crew_unscheduled", eventId, assigneeKey, anchor);
      const group = nextGroup ?? previousGroup;
      const subjectContext = labelRuns
        ? `${event.title} — ${shiftGroupBlockLabels(group, blockLabelById).join(", ")}`
        : event.title;
      const groupFingerprint = shiftGroupFingerprint(group);
      const icsEvent = icsEventFor(crewInviteUid(eventId, assigneeKey, anchor), group);

      if (nextGroup) {
        if (shiftGroupFingerprint(previousGroup) === groupFingerprint) continue;
        // Re-assignment supersedes any pending removal notice.
        await cancelPendingDebouncedEmail(ctx, unscheduledKey);
        await enqueueDebouncedEmail(ctx, {
          template: "crew_scheduled",
          to: to.email,
          recipientUserId: to.userId,
          subject: subjectForTemplate("crew_scheduled", subjectContext),
          eventId,
          debounceKey: scheduledKey,
          // Include a nonce so re-assigning the same shifts after a change still notifies.
          // Burst edits coalesce via debounceKey; identical no-op saves are skipped above.
          idempotencyKey: `${scheduledKey}:${groupFingerprint}:${Date.now()}`,
          payload: {
            ...base,
            assignmentSummaries: nextGroup.map((shift) =>
              formatAssignmentSummary(shift, blockLabelById, timezone),
            ),
            fullScheduleSummaries: coversEntireEvent ? [] : fullScheduleSummaries,
            coversEntireEvent,
            icsEvent,
          },
        });
        continue;
      }

      // This run is gone: drop its pending invite; cancel it if one already went out.
      await cancelPendingDebouncedEmail(ctx, scheduledKey);
      if (!(await hasSentDebouncedEmail(ctx, scheduledKey))) continue;
      await enqueueDebouncedEmail(ctx, {
        template: "crew_unscheduled",
        to: to.email,
        recipientUserId: to.userId,
        subject: subjectForTemplate("crew_unscheduled", subjectContext),
        eventId,
        debounceKey: unscheduledKey,
        idempotencyKey: `${unscheduledKey}:${groupFingerprint}:${Date.now()}`,
        payload: {
          ...base,
          previousAssignmentSummaries: previousGroup.map((shift) =>
            formatAssignmentSummary(shift, blockLabelById, timezone),
          ),
          remainingAssignmentSummaries,
          icsEvent,
        },
      });
    }
  }
}

async function latestSentAt(ctx: MutationCtx, debounceKey: string) {
  const rows = await ctx.db
    .query("emailNotifications")
    .withIndex("by_debounceKey_and_status", (q) =>
      q.eq("debounceKey", debounceKey).eq("status", "sent"),
    )
    .take(50);
  return Math.max(0, ...rows.map((row) => row.sentAt ?? row.createdAt));
}

/**
 * Crew used to get one merged invite per event under the per-person legacy
 * UID. The first time such a person's shifts change, cancel that invite (the
 * per-run invites replace it) so their calendar doesn't keep a stale duplicate.
 */
async function retireLegacyCrewInvite(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    assigneeKey: string;
    to: { email: string; userId?: string };
    subjectContext: string;
    payload: CrewUnscheduledEmailPayload;
  },
) {
  const scheduledKey = legacyCrewInviteDebounceKey("crew_scheduled", args.eventId, args.assigneeKey);
  const unscheduledKey = legacyCrewInviteDebounceKey(
    "crew_unscheduled",
    args.eventId,
    args.assigneeKey,
  );
  // A merged invite still queued from before the split must not go out now.
  await cancelPendingDebouncedEmail(ctx, scheduledKey);
  const invitedAt = await latestSentAt(ctx, scheduledKey);
  if (invitedAt === 0 || invitedAt < (await latestSentAt(ctx, unscheduledKey))) return;
  await enqueueDebouncedEmail(ctx, {
    template: "crew_unscheduled",
    to: args.to.email,
    recipientUserId: args.to.userId,
    subject: args.payload.replacedBySeparateInvites
      ? `Calendar invite replaced: ${args.subjectContext}`
      : subjectForTemplate("crew_unscheduled", args.subjectContext),
    eventId: args.eventId,
    debounceKey: unscheduledKey,
    idempotencyKey: `${unscheduledKey}:${invitedAt}:${Date.now()}`,
    payload: args.payload,
  });
}

export async function scheduleScheduleReminderEmail(
  ctx: MutationCtx,
  eventId: Id<"events">,
  daysUntilEvent: number,
  dayKey: string,
  recipient: { email: string; name?: string },
) {
  const event = await ctx.db.get(eventId);
  if (!event) return;

  await enqueueEmail(ctx, {
    template: "schedule_reminder",
    to: recipient.email,
    subject: subjectForTemplate("schedule_reminder", event.title),
    eventId,
    idempotencyKey: `schedule_reminder:${eventId}:${dayKey}:${recipient.email}`,
    payload: {
      ...buildBasePayload(event, recipient.name),
      daysUntilEvent,
    },
  });
}
