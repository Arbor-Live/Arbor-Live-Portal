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

    const previousGroups = groupShiftsByConsecutiveBlocks(previousAssigneeShifts, blocks);
    const nextGroups = groupShiftsByConsecutiveBlocks(nextAssigneeShifts, blocks);
    const coversEntireEvent =
      nextGroups.length === 1 && userCoversEntireSchedule(nextAssigneeShifts, blocks);
    const remainingAssignmentSummaries = nextAssigneeShifts.map((shift) =>
      formatAssignmentSummary(shift, blockLabelById, timezone),
    );
    const to = await resolveCrewAssigneeRecipient(ctx, assigneeKey);

    for (let index = 0; index < Math.max(previousGroups.length, nextGroups.length); index += 1) {
      const previousGroup = previousGroups[index] ?? [];
      const nextGroup = nextGroups[index];
      const scheduledKey = crewInviteDebounceKey("crew_scheduled", eventId, assigneeKey, index);
      const unscheduledKey = crewInviteDebounceKey("crew_unscheduled", eventId, assigneeKey, index);
      const group = nextGroup ?? previousGroup;
      const subjectContext =
        Math.max(previousGroups.length, nextGroups.length) > 1
          ? `${event.title} — ${shiftGroupBlockLabels(group, blockLabelById).join(", ")}`
          : event.title;
      const groupFingerprint = shiftGroupFingerprint(group);

      if (nextGroup) {
        if (shiftGroupFingerprint(previousGroup) === groupFingerprint) continue;
        // Re-assignment supersedes any pending removal notice.
        await cancelPendingDebouncedEmail(ctx, unscheduledKey);
        if (!to) continue;
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
            ...buildBasePayload(event, to.name),
            eventLeadName,
            assignmentSummaries: nextGroup.map((shift) =>
              formatAssignmentSummary(shift, blockLabelById, timezone),
            ),
            fullScheduleSummaries: coversEntireEvent ? [] : fullScheduleSummaries,
            coversEntireEvent,
            icsEvent: buildCrewShiftGroupIcsEvent({
              eventId,
              assigneeKey,
              groupIndex: index,
              eventTitle: event.title,
              venueName: event.venueName,
              group: nextGroup,
              blockLabelById,
              timezone,
              sequence: inviteSequence,
            }),
            timezone,
          },
        });
        continue;
      }

      // This run is gone: drop its pending invite; cancel it if one already went out.
      await cancelPendingDebouncedEmail(ctx, scheduledKey);
      if (!to || !(await hasSentDebouncedEmail(ctx, scheduledKey))) continue;
      await enqueueDebouncedEmail(ctx, {
        template: "crew_unscheduled",
        to: to.email,
        recipientUserId: to.userId,
        subject: subjectForTemplate("crew_unscheduled", subjectContext),
        eventId,
        debounceKey: unscheduledKey,
        idempotencyKey: `${unscheduledKey}:${groupFingerprint}:${Date.now()}`,
        payload: {
          ...buildBasePayload(event, to.name),
          eventLeadName,
          previousAssignmentSummaries: previousGroup.map((shift) =>
            formatAssignmentSummary(shift, blockLabelById, timezone),
          ),
          remainingAssignmentSummaries,
          icsEvent: buildCrewShiftGroupIcsEvent({
            eventId,
            assigneeKey,
            groupIndex: index,
            eventTitle: event.title,
            venueName: event.venueName,
            group: previousGroup,
            blockLabelById,
            timezone,
            sequence: inviteSequence,
          }),
          timezone,
        },
      });
    }
  }
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
