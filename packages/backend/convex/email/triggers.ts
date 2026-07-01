import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  EVENT_TIMEZONE,
  eventDashboardUrl,
  formatEventDateRange,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";
import {
  getEventLeadRecipients,
  getEventStakeholderEmails,
  getUserScheduledEmailRecipient,
} from "./recipients";
import {
  buildMergedIcsEventForShiftGroup,
  formatAssignmentSummary,
  formatScheduleBlockSummary,
  groupShiftsByConsecutiveBlocks,
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

  const blockSummaries = blocks.map((block) => {
    const start = new Date(block.startsAt).toLocaleString("en-US", {
      timeZone: event.timezone || EVENT_TIMEZONE,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    const end = new Date(block.endsAt).toLocaleString("en-US", {
      timeZone: event.timezone || EVENT_TIMEZONE,
      hour: "numeric",
      minute: "2-digit",
    });
    return `${block.label}: ${start} – ${end}`;
  });

  const recipients = await getEventLeadRecipients(ctx, eventId);
  const subject = subjectForTemplate("schedule_published", event.title);

  for (const recipient of recipients) {
    await enqueueEmail(ctx, {
      template: "schedule_published",
      to: recipient.email,
      subject,
      eventId,
      idempotencyKey: `schedule_published:${eventId}:${fingerprint}:${recipient.email}`,
      payload: {
        ...buildBasePayload(event, recipient.name),
        blockSummaries,
      },
    });
  }
}

export async function scheduleCrewScheduledEmails(
  ctx: MutationCtx,
  eventId: Id<"events">,
  previousShifts: CrewShiftLike[],
  nextShifts: CrewShiftLike[],
) {
  const event = await ctx.db.get(eventId);
  if (!event) return;

  const timezone = event.timezone || EVENT_TIMEZONE;
  const assignedUserIds = [
    ...new Set(
      nextShifts
        .map((shift) => shift.userId?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  if (assignedUserIds.length === 0) return;

  const blocks = await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
    .take(500);
  const blockLabelById = new Map(blocks.map((block) => [block._id, block.label]));
  const fullScheduleSummaries = blocks.map((block) => formatScheduleBlockSummary(block, timezone));
  const eventLeadName = event.dayOfLeadUserId
    ? (await getUserScheduledEmailRecipient(ctx, event.dayOfLeadUserId))?.name
    : undefined;
  const subject = subjectForTemplate("crew_scheduled", event.title);

  for (const userId of assignedUserIds) {
    const recipient = await getUserScheduledEmailRecipient(ctx, userId);
    if (!recipient) continue;

    const previousUserShifts = previousShifts.filter((shift) => shift.userId === userId);
    const nextUserShifts = nextShifts.filter((shift) => shift.userId === userId);
    if (nextUserShifts.length === 0) continue;

    const previousGroups = groupShiftsByConsecutiveBlocks(previousUserShifts, blocks);
    const nextGroups = groupShiftsByConsecutiveBlocks(nextUserShifts, blocks);
    const previousFingerprints = new Set(previousGroups.map((group) => shiftGroupFingerprint(group)));
    const coversEntireEventForUser = userCoversEntireSchedule(nextUserShifts, blocks);

    for (let groupIndex = 0; groupIndex < nextGroups.length; groupIndex += 1) {
      const group = nextGroups[groupIndex]!;
      const groupFingerprint = shiftGroupFingerprint(group);
      if (previousFingerprints.has(groupFingerprint)) continue;

      const assignmentSummaries = group.map((shift) =>
        formatAssignmentSummary(shift, blockLabelById, timezone),
      );
      const coversEntireEvent =
        coversEntireEventForUser && nextGroups.length === 1 && group.length === nextUserShifts.length;
      const icsEvents = [
        buildMergedIcsEventForShiftGroup({
          eventId,
          userId,
          groupIndex,
          eventTitle: event.title,
          venueName: event.venueName,
          group,
          blockLabelById,
          timezone,
        }),
      ];

      await enqueueEmail(ctx, {
        template: "crew_scheduled",
        to: recipient.email,
        subject,
        eventId,
        idempotencyKey: `crew_scheduled:${eventId}:${userId}:${groupFingerprint}`,
        payload: {
          ...buildBasePayload(event, recipient.name),
          eventLeadName,
          assignmentSummaries,
          fullScheduleSummaries: coversEntireEvent ? [] : fullScheduleSummaries,
          coversEntireEvent,
          icsEvents,
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
