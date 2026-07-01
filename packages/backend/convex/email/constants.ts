export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "Arbor Notifications <noreply@arbor.st>";

export const ORGANIZER_EMAIL = process.env.ORGANIZER_EMAIL ?? "arborlive@stanford.edu";

export const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const EVENT_TIMEZONE = "America/Los_Angeles";

export type EmailTemplate =
  | "event_cancelled"
  | "schedule_published"
  | "crew_scheduled"
  | "schedule_reminder"
  | "user_invite"
  | "password_reset"
  | "email_verification"
  | "change_email_confirmation"
  | "booking_request_received"
  | "booking_quote_ready"
  | "payment_proof_reminder"
  | "payment_proof_submitted"
  | "paying_party_added";

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

export function inviteAcceptUrl(token: string) {
  return `${SITE_URL}/accept-invite?token=${encodeURIComponent(token)}`;
}

export function signInUrl(email?: string) {
  if (!email) return `${SITE_URL}/sign-in`;
  return `${SITE_URL}/sign-in?email=${encodeURIComponent(email)}`;
}

export function requestTrackingUrl(token: string) {
  return `${SITE_URL}/public/request/track/${encodeURIComponent(token)}`;
}

export function publicQuoteUrl(token: string) {
  return `${SITE_URL}/public/event/${encodeURIComponent(token)}`;
}

export function formatInviteExpiry(expiresAt: number, timezone: string = EVENT_TIMEZONE) {
  return new Date(expiresAt).toLocaleString("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function subjectForTemplate(template: EmailTemplate, context: string) {
  switch (template) {
    case "event_cancelled":
      return `Cancelled: ${context}`;
    case "schedule_published":
      return `Schedule published: ${context}`;
    case "crew_scheduled":
      return `You're scheduled: ${context}`;
    case "schedule_reminder":
      return `Schedule needed: ${context}`;
    case "user_invite":
      return `You're invited to ${context}`;
    case "password_reset":
      return "Reset your Arbor Live password";
    case "email_verification":
      return "Verify your Arbor Live email";
    case "change_email_confirmation":
      return "Approve your Arbor Live email change";
    case "booking_request_received":
      return `Request received: ${context}`;
    case "booking_quote_ready":
      return `Your quote is ready: ${context}`;
    case "payment_proof_reminder":
      return `Payment proof needed: ${context}`;
    case "payment_proof_submitted":
      return `Payment proof received: ${context}`;
    case "paying_party_added":
      return `You've been added as the paying party: ${context}`;
  }
}

export function reminderDayKey(nowMs: number, timezone: string = EVENT_TIMEZONE) {
  return new Date(nowMs).toLocaleDateString("en-CA", { timeZone: timezone });
}
