import {
  renderBookingQuoteReadyEmail,
  renderBookingRequestReceivedEmail,
  renderEventCancelledEmail,
  renderPasswordResetEmail,
  renderEmailVerificationEmail,
  renderChangeEmailConfirmationEmail,
  renderPaymentProofReminderEmail,
  renderPaymentProofSubmittedEmail,
  renderPayingPartyAddedEmail,
  renderBandPaymentConfirmationEmail,
  renderBandPaymentCompletedEmail,
  renderBandPaymentPayeeRequiredEmail,
  renderCrewScheduledEmail,
  renderCrewUnscheduledEmail,
  renderSchedulePublishedEmail,
  renderScheduleReminderEmail,
  renderUserInviteEmail,
} from "@arbor/email/render";
import type {
  BookingQuoteReadyEmailProps,
  BookingRequestReceivedEmailProps,
  EventEmailProps,
  PasswordResetEmailProps,
  EmailVerificationEmailProps,
  ChangeEmailConfirmationEmailProps,
  PaymentProofReminderEmailProps,
  PaymentProofSubmittedEmailProps,
  PayingPartyAddedEmailProps,
  BandPaymentConfirmationEmailProps,
  BandPaymentCompletedEmailProps,
  BandPaymentPayeeRequiredEmailProps,
  CrewScheduledEmailProps,
  CrewUnscheduledEmailProps,
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
    case "crew_scheduled":
      return renderCrewScheduledEmail(payload as CrewScheduledEmailProps);
    case "crew_unscheduled":
      return renderCrewUnscheduledEmail(payload as CrewUnscheduledEmailProps);
    case "schedule_reminder":
      return renderScheduleReminderEmail(payload as ScheduleReminderEmailProps);
    case "user_invite":
      return renderUserInviteEmail(payload as UserInviteEmailProps);
    case "password_reset":
      return renderPasswordResetEmail(payload as PasswordResetEmailProps);
    case "email_verification":
      return renderEmailVerificationEmail(payload as EmailVerificationEmailProps);
    case "change_email_confirmation":
      return renderChangeEmailConfirmationEmail(payload as ChangeEmailConfirmationEmailProps);
    case "booking_request_received":
      return renderBookingRequestReceivedEmail(payload as BookingRequestReceivedEmailProps);
    case "booking_quote_ready":
      return renderBookingQuoteReadyEmail(payload as BookingQuoteReadyEmailProps);
    case "payment_proof_reminder":
      return renderPaymentProofReminderEmail(payload as PaymentProofReminderEmailProps);
    case "payment_proof_submitted":
      return renderPaymentProofSubmittedEmail(payload as PaymentProofSubmittedEmailProps);
    case "paying_party_added":
      return renderPayingPartyAddedEmail(payload as PayingPartyAddedEmailProps);
    case "band_payment_confirmation":
      return renderBandPaymentConfirmationEmail(payload as BandPaymentConfirmationEmailProps);
    case "band_payment_completed":
      return renderBandPaymentCompletedEmail(payload as BandPaymentCompletedEmailProps);
    case "band_payment_payee_required":
      return renderBandPaymentPayeeRequiredEmail(payload as BandPaymentPayeeRequiredEmailProps);
  }
}
