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
  getEventStakeholderEmails,
  getSchedulePublishedRecipients,
} from "./recipients";

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

  const recipients = await getSchedulePublishedRecipients(ctx, eventId);
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
