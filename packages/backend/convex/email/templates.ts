import {
  renderBookingQuoteReadyEmail,
  renderBookingRequestReceivedEmail,
  renderEventCancelledEmail,
  renderPasswordResetEmail,
  renderPaymentProofReminderEmail,
  renderPaymentProofSubmittedEmail,
  renderSchedulePublishedEmail,
  renderScheduleReminderEmail,
  renderUserInviteEmail,
} from "@arbor/email/render";
import type {
  BookingQuoteReadyEmailProps,
  BookingRequestReceivedEmailProps,
  EventEmailProps,
  PasswordResetEmailProps,
  PaymentProofReminderEmailProps,
  PaymentProofSubmittedEmailProps,
  SchedulePublishedEmailProps,
  ScheduleReminderEmailProps,
  UserInviteEmailProps,
} from "@arbor/email/types";
import type { EmailTemplate } from "./constants";

export async function renderEmailHtml(template: EmailTemplate, payload: unknown) {
  switch (template) {
    case "event_cancelled":
      return renderEventCancelledEmail(payload as EventEmailProps);
    case "schedule_published":
      return renderSchedulePublishedEmail(payload as SchedulePublishedEmailProps);
    case "schedule_reminder":
      return renderScheduleReminderEmail(payload as ScheduleReminderEmailProps);
    case "user_invite":
      return renderUserInviteEmail(payload as UserInviteEmailProps);
    case "password_reset":
      return renderPasswordResetEmail(payload as PasswordResetEmailProps);
    case "booking_request_received":
      return renderBookingRequestReceivedEmail(payload as BookingRequestReceivedEmailProps);
    case "booking_quote_ready":
      return renderBookingQuoteReadyEmail(payload as BookingQuoteReadyEmailProps);
    case "payment_proof_reminder":
      return renderPaymentProofReminderEmail(payload as PaymentProofReminderEmailProps);
    case "payment_proof_submitted":
      return renderPaymentProofSubmittedEmail(payload as PaymentProofSubmittedEmailProps);
  }
}
