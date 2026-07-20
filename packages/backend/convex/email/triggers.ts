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
  buildSingleIcsEventForUserShifts,
  formatAssignmentSummary,
  formatBlockTimeRange,
  formatScheduleBlockSummary,
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

export async function scheduleCrewScheduledEmails(
  ctx: MutationCtx,
  eventId: Id<"events">,
  previousShifts: CrewShiftLike[],
  nextShifts: CrewShiftLike[],
) {
  const event = await ctx.db.get(eventId);
  if (!event) return;

  const timezone = event.timezone || EVENT_TIMEZONE;
  const previousUserIds = [
    ...new Set(
      previousShifts
        .map((shift) => shift.userId?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const assignedUserIds = [
    ...new Set(
      nextShifts
        .map((shift) => shift.userId?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const assignedUserIdSet = new Set(assignedUserIds);

  const blocks = await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
    .take(500);
  const blockLabelById = new Map(blocks.map((block) => [block._id, block.label]));
  const fullScheduleSummaries = blocks.map((block) => formatScheduleBlockSummary(block, timezone));
  const eventLeadName = event.dayOfLeadUserId
    ? (await getUserScheduledEmailRecipient(ctx, event.dayOfLeadUserId))?.name
    : undefined;

  // Fully unassigned: drop pending schedule emails; send cancel if they already got an invite.
  for (const userId of previousUserIds) {
    if (assignedUserIdSet.has(userId)) continue;

    const scheduleDebounceKey = `crew_scheduled:${eventId}:${userId}`;
    await cancelPendingDebouncedEmail(ctx, scheduleDebounceKey);

    const previousUserShifts = previousShifts.filter((shift) => shift.userId === userId);
    if (previousUserShifts.length === 0) continue;

    const hadInvite = await hasSentDebouncedEmail(ctx, scheduleDebounceKey);
    if (!hadInvite) continue;

    const recipient = await getUserScheduledEmailRecipient(ctx, userId);
    if (!recipient) continue;

    const previousAssignmentSummaries = previousUserShifts.map((shift) =>
      formatAssignmentSummary(shift, blockLabelById, timezone),
    );
    const icsEvents = [
      buildSingleIcsEventForUserShifts({
        eventId,
        userId,
        eventTitle: event.title,
        venueName: event.venueName,
        shifts: previousUserShifts,
        blockLabelById,
        timezone,
      }),
    ];
    const previousFingerprint = shiftGroupFingerprint(previousUserShifts);

    await enqueueDebouncedEmail(ctx, {
      template: "crew_unscheduled",
      to: recipient.email,
      subject: subjectForTemplate("crew_unscheduled", event.title),
      eventId,
      debounceKey: `crew_unscheduled:${eventId}:${userId}`,
      idempotencyKey: `crew_unscheduled:${eventId}:${userId}:${previousFingerprint}:${Date.now()}`,
      payload: {
        ...buildBasePayload(event, recipient.name),
        eventLeadName,
        previousAssignmentSummaries,
        icsEvents,
        timezone,
      },
    });
  }

  const previousApplicationIds = [
    ...new Set(
      previousShifts
        .filter((shift) => !shift.userId?.trim() && shift.crewApplicationId)
        .map((shift) => shift.crewApplicationId!)
        .filter(Boolean),
    ),
  ];
  const assignedApplicationIds = [
    ...new Set(
      nextShifts
        .filter((shift) => !shift.userId?.trim() && shift.crewApplicationId)
        .map((shift) => shift.crewApplicationId!)
        .filter(Boolean),
    ),
  ];
  const assignedApplicationIdSet = new Set(assignedApplicationIds);

  for (const applicationId of previousApplicationIds) {
    if (assignedApplicationIdSet.has(applicationId)) continue;

    const scheduleDebounceKey = `crew_scheduled:${eventId}:application:${applicationId}`;
    await cancelPendingDebouncedEmail(ctx, scheduleDebounceKey);

    const previousAppShifts = previousShifts.filter(
      (shift) => shift.crewApplicationId === applicationId && !shift.userId?.trim(),
    );
    if (previousAppShifts.length === 0) continue;

    const hadInvite = await hasSentDebouncedEmail(ctx, scheduleDebounceKey);
    if (!hadInvite) continue;

    const application = await ctx.db.get(applicationId);
    if (!application?.email) continue;

    const previousAssignmentSummaries = previousAppShifts.map((shift) =>
      formatAssignmentSummary(shift, blockLabelById, timezone),
    );
    const icsEvents = [
      buildSingleIcsEventForUserShifts({
        eventId,
        userId: `application:${applicationId}`,
        eventTitle: event.title,
        venueName: event.venueName,
        shifts: previousAppShifts,
        blockLabelById,
        timezone,
      }),
    ];
    const previousFingerprint = shiftGroupFingerprint(previousAppShifts);

    await enqueueDebouncedEmail(ctx, {
      template: "crew_unscheduled",
      to: application.email,
      subject: subjectForTemplate("crew_unscheduled", event.title),
      eventId,
      debounceKey: `crew_unscheduled:${eventId}:application:${applicationId}`,
      idempotencyKey: `crew_unscheduled:${eventId}:application:${applicationId}:${previousFingerprint}:${Date.now()}`,
      payload: {
        ...buildBasePayload(event, application.name),
        eventLeadName,
        previousAssignmentSummaries,
        icsEvents,
        timezone,
      },
    });
  }

  const subject = subjectForTemplate("crew_scheduled", event.title);

  for (const userId of assignedUserIds) {
    // Re-assignment supersedes any pending removal notice.
    await cancelPendingDebouncedEmail(ctx, `crew_unscheduled:${eventId}:${userId}`);

    const recipient = await getUserScheduledEmailRecipient(ctx, userId);
    if (!recipient) continue;

    const previousUserShifts = previousShifts.filter((shift) => shift.userId === userId);
    const nextUserShifts = nextShifts.filter((shift) => shift.userId === userId);
    if (nextUserShifts.length === 0) continue;

    const previousFingerprint = shiftGroupFingerprint(previousUserShifts);
    const nextFingerprint = shiftGroupFingerprint(nextUserShifts);
    // No assignment change for this user (debounce still coalesces bursts via debounceKey).
    if (previousFingerprint === nextFingerprint) continue;

    const coversEntireEvent = userCoversEntireSchedule(nextUserShifts, blocks);
    const assignmentSummaries = nextUserShifts.map((shift) =>
      formatAssignmentSummary(shift, blockLabelById, timezone),
    );
    // One VEVENT spanning earliest start → latest end so clients that only
    // honor a single invite still cover gaps (e.g. 9–10 + 11–12 → 9–12).
    const icsEvents = [
      buildSingleIcsEventForUserShifts({
        eventId,
        userId,
        eventTitle: event.title,
        venueName: event.venueName,
        shifts: nextUserShifts,
        blockLabelById,
        timezone,
      }),
    ];

    await enqueueDebouncedEmail(ctx, {
      template: "crew_scheduled",
      to: recipient.email,
      subject,
      eventId,
      debounceKey: `crew_scheduled:${eventId}:${userId}`,
      // Include a nonce so re-assigning the same shifts after a change still notifies.
      // Burst edits coalesce via debounceKey; identical no-op saves are skipped above.
      idempotencyKey: `crew_scheduled:${eventId}:${userId}:${nextFingerprint}:${Date.now()}`,
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

  for (const applicationId of assignedApplicationIds) {
    await cancelPendingDebouncedEmail(ctx, `crew_unscheduled:${eventId}:application:${applicationId}`);

    const application = await ctx.db.get(applicationId);
    if (!application?.email) continue;

    const previousAppShifts = previousShifts.filter(
      (shift) => shift.crewApplicationId === applicationId && !shift.userId?.trim(),
    );
    const nextAppShifts = nextShifts.filter(
      (shift) => shift.crewApplicationId === applicationId && !shift.userId?.trim(),
    );
    if (nextAppShifts.length === 0) continue;

    const previousFingerprint = shiftGroupFingerprint(previousAppShifts);
    const nextFingerprint = shiftGroupFingerprint(nextAppShifts);
    if (previousFingerprint === nextFingerprint) continue;

    const coversEntireEvent = userCoversEntireSchedule(nextAppShifts, blocks);
    const assignmentSummaries = nextAppShifts.map((shift) =>
      formatAssignmentSummary(shift, blockLabelById, timezone),
    );
    const icsEvents = [
      buildSingleIcsEventForUserShifts({
        eventId,
        userId: `application:${applicationId}`,
        eventTitle: event.title,
        venueName: event.venueName,
        shifts: nextAppShifts,
        blockLabelById,
        timezone,
      }),
    ];

    await enqueueDebouncedEmail(ctx, {
      template: "crew_scheduled",
      to: application.email,
      subject,
      eventId,
      debounceKey: `crew_scheduled:${eventId}:application:${applicationId}`,
      idempotencyKey: `crew_scheduled:${eventId}:application:${applicationId}:${nextFingerprint}:${Date.now()}`,
      payload: {
        ...buildBasePayload(event, application.name),
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
