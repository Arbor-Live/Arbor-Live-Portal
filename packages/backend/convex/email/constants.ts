import {
  formatDateTime,
  formatDateTimeRange,
  pacificDateKey,
  PORTAL_TIMEZONE,
} from "@arbor/format";

export const EMAIL_FROM =
  process.env.EMAIL_FROM ?? "Arbor Notifications <noreply@arbor.st>";

export const PAYMENTS_EMAIL_FROM =
  process.env.PAYMENTS_EMAIL_FROM ?? "Arbor Live — Financial Manager <payments@arbor.st>";

export const BAND_PAYMENTS_CC_EMAIL =
  process.env.BAND_PAYMENTS_CC_EMAIL ?? "arborlive@stanford.edu";

function parseEmailAddress(from: string) {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1]!.trim().toLowerCase();
  return from.trim().toLowerCase();
}

export const ORGANIZER_EMAIL =
  process.env.ORGANIZER_EMAIL ?? parseEmailAddress(EMAIL_FROM);

export const SITE_URL = process.env.SITE_URL ?? "http://localhost:3000";

export const EVENT_TIMEZONE = PORTAL_TIMEZONE;

export type EmailTemplate =
  | "event_cancelled"
  | "schedule_published"
  | "crew_scheduled"
  | "crew_unscheduled"
  | "schedule_reminder"
  | "user_invite"
  | "password_reset"
  | "email_verification"
  | "change_email_confirmation"
  | "booking_request_received"
  | "booking_quote_ready"
  | "payment_proof_reminder"
  | "payment_proof_submitted"
  | "paying_party_added"
  | "band_payment_confirmation"
  | "band_payment_completed"
  | "band_payment_payee_required"
  | "onboarding_completed"
  | "onboarding_reminder"
  | "band_application_received"
  | "band_application_approved"
  | "band_application_declined"
  | "band_application_confirmation"
  | "crew_application_received"
  | "crew_application_closed"
  | "crew_application_confirmation"
  | "crew_trainee_intro";

export function eventDashboardUrl(eventId: string) {
  return `${SITE_URL}/dashboard/events/${eventId}`;
}

export function formatEventDateRange(
  startAt: number,
  endAt: number,
  timezone: string = EVENT_TIMEZONE,
) {
  return formatDateTimeRange(startAt, endAt, timezone);
}

export function inviteAcceptUrl(token: string) {
  return `${SITE_URL}/accept-invite?token=${encodeURIComponent(token)}`;
}

export function signInUrl(email?: string, callbackPath?: string) {
  const params = new URLSearchParams();
  if (email) params.set("email", email);
  if (callbackPath) params.set("redirect", callbackPath);
  const qs = params.toString();
  return qs ? `${SITE_URL}/sign-in?${qs}` : `${SITE_URL}/sign-in`;
}

export function onboardingUrl(path: "/onboarding" | "/onboarding/band" = "/onboarding") {
  return `${SITE_URL}${path}`;
}

export function bandApplicationsAdminUrl() {
  return `${SITE_URL}/dashboard/users/band-applications`;
}

export function crewApplicationsAdminUrl() {
  return `${SITE_URL}/dashboard/users/crew-applications`;
}

export function requestTrackingUrl(token: string) {
  return `${SITE_URL}/public/request/track/${encodeURIComponent(token)}`;
}

export function publicQuoteUrl(token: string) {
  return `${SITE_URL}/public/event/${encodeURIComponent(token)}`;
}

export function formatInviteExpiry(expiresAt: number, timezone: string = EVENT_TIMEZONE) {
  return formatDateTime(expiresAt, "long", timezone);
}

export function bandPayeeSettingsUrl() {
  return `${SITE_URL}/dashboard/bands-and-performers#payment-payee`;
}

export function subjectForTemplate(template: EmailTemplate, context: string) {
  switch (template) {
    case "event_cancelled":
      return `Cancelled: ${context}`;
    case "schedule_published":
      return `Schedule published: ${context}`;
    case "crew_scheduled":
      return `You're scheduled: ${context}`;
    case "crew_unscheduled":
      return `Schedule removed: ${context}`;
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
    case "band_payment_confirmation":
      return `Payment confirmation needed: ${context}`;
    case "band_payment_completed":
      return `Band payment processed: ${context}`;
    case "band_payment_payee_required":
      return `Payment payee info needed: ${context}`;
    case "onboarding_completed":
      return `Crew onboarding complete: ${context}`;
    case "onboarding_reminder":
      return "Finish your Arbor Live onboarding";
    case "band_application_received":
      return `New band application: ${context}`;
    case "band_application_approved":
      return `You're approved: ${context}`;
    case "band_application_declined":
      return `Update on your Arbor Live application: ${context}`;
    case "band_application_confirmation":
      return `We got your application: ${context}`;
    case "crew_application_received":
      return `New crew application: ${context}`;
    case "crew_application_closed":
      return `Update on your Arbor Live crew application`;
    case "crew_application_confirmation":
      return `We got your crew application`;
    case "crew_trainee_intro":
      return `You're training with us: ${context}`;
  }
}

export function reminderDayKey(nowMs: number, timezone: string = EVENT_TIMEZONE) {
  return pacificDateKey(nowMs, timezone);
}
