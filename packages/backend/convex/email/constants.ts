export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "Arbor Notifications <noreply@arbor.st>";

export const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const EVENT_TIMEZONE = "America/Los_Angeles";

export type EmailTemplate = "event_cancelled" | "schedule_published" | "schedule_reminder";

export function eventDashboardUrl(eventId: string) {
  return `${SITE_URL}/dashboard/events/${eventId}`;
}

export function formatEventDateRange(
  startAt: number,
  endAt: number,
  timezone: string = EVENT_TIMEZONE,
) {
  const dateOpts: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  const timeOpts: Intl.DateTimeFormatOptions = {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  };

  const sameDay = new Date(startAt).toDateString() === new Date(endAt).toDateString();
  const startLabel = new Date(startAt).toLocaleString("en-US", {
    ...dateOpts,
    ...timeOpts,
  });

  if (sameDay) {
    const endTime = new Date(endAt).toLocaleString("en-US", timeOpts);
    return `${startLabel} – ${endTime}`;
  }

  const endLabel = new Date(endAt).toLocaleString("en-US", { ...dateOpts, ...timeOpts });
  return `${startLabel} – ${endLabel}`;
}

export function subjectForTemplate(template: EmailTemplate, eventTitle: string) {
  switch (template) {
    case "event_cancelled":
      return `Cancelled: ${eventTitle}`;
    case "schedule_published":
      return `Schedule published: ${eventTitle}`;
    case "schedule_reminder":
      return `Schedule needed: ${eventTitle}`;
  }
}

export function reminderDayKey(nowMs: number, timezone: string = EVENT_TIMEZONE) {
  return new Date(nowMs).toLocaleDateString("en-CA", { timeZone: timezone });
}
