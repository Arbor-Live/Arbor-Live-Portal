import {
  renderBookingQuoteReadyEmail,
  renderBookingRequestAdminEmail,
  renderBookingRequestReceivedEmail,
  renderEventCancelledEmail,
  renderPasswordResetEmail,
  renderEmailVerificationEmail,
  renderChangeEmailConfirmationEmail,
  renderPaymentProofReminderEmail,
  renderPaymentProofSubmittedEmail,
  renderPayingPartyAddedEmail,
  renderBandAssignedEmail,
  renderBandPaymentConfirmationEmail,
  renderBandPaymentCompletedEmail,
  renderBandPaymentPayeeRequiredEmail,
  renderCrewScheduledEmail,
  renderCrewUnscheduledEmail,
  renderSchedulePublishedEmail,
  renderScheduleReminderEmail,
  renderUserInviteEmail,
  renderOnboardingCompletedEmail,
  renderOnboardingReminderEmail,
  renderBandApplicationReceivedEmail,
  renderBandApplicationApprovedEmail,
  renderBandApplicationDeclinedEmail,
  renderBandApplicationConfirmationEmail,
  renderCrewApplicationReceivedEmail,
  renderCrewApplicationClosedEmail,
  renderCrewApplicationConfirmationEmail,
  renderCrewTraineeIntroEmail,
  renderRentalOutboundPackedEmail,
  renderRentalReturnProcessedEmail,
  renderPostEventAlbumEmail,
  renderEventCommentMentionEmail,
  renderCommentMentionEmail,
} from "@arbor/email/render";
import type {
  BookingQuoteReadyEmailProps,
  BookingRequestAdminEmailProps,
  BookingRequestReceivedEmailProps,
  EventEmailProps,
  PasswordResetEmailProps,
  EmailVerificationEmailProps,
  ChangeEmailConfirmationEmailProps,
  PaymentProofReminderEmailProps,
  PaymentProofSubmittedEmailProps,
  PayingPartyAddedEmailProps,
  BandAssignedEmailProps,
  BandPaymentConfirmationEmailProps,
  BandPaymentCompletedEmailProps,
  BandPaymentPayeeRequiredEmailProps,
  CrewScheduledEmailProps,
  CrewUnscheduledEmailProps,
  SchedulePublishedEmailProps,
  ScheduleReminderEmailProps,
  UserInviteEmailProps,
  OnboardingCompletedEmailProps,
  OnboardingReminderEmailProps,
  BandApplicationReceivedEmailProps,
  BandApplicationDecisionEmailProps,
  BandApplicationConfirmationEmailProps,
  CrewApplicationReceivedEmailProps,
  CrewApplicationClosedEmailProps,
  CrewApplicationConfirmationEmailProps,
  CrewTraineeIntroEmailProps,
  RentalOutboundPackedEmailProps,
  RentalReturnProcessedEmailProps,
  PostEventAlbumEmailProps,
  EventCommentMentionEmailProps,
  CommentMentionEmailProps,
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
    case "booking_request_admin":
      return renderBookingRequestAdminEmail(payload as BookingRequestAdminEmailProps);
    case "booking_quote_ready":
      return renderBookingQuoteReadyEmail(payload as BookingQuoteReadyEmailProps);
    case "payment_proof_reminder":
      return renderPaymentProofReminderEmail(payload as PaymentProofReminderEmailProps);
    case "payment_proof_submitted":
      return renderPaymentProofSubmittedEmail(payload as PaymentProofSubmittedEmailProps);
    case "paying_party_added":
      return renderPayingPartyAddedEmail(payload as PayingPartyAddedEmailProps);
    case "band_assigned":
      return renderBandAssignedEmail(payload as BandAssignedEmailProps);
    case "band_payment_confirmation":
      return renderBandPaymentConfirmationEmail(payload as BandPaymentConfirmationEmailProps);
    case "band_payment_completed":
      return renderBandPaymentCompletedEmail(payload as BandPaymentCompletedEmailProps);
    case "band_payment_payee_required":
      return renderBandPaymentPayeeRequiredEmail(payload as BandPaymentPayeeRequiredEmailProps);
    case "onboarding_completed":
      return renderOnboardingCompletedEmail(payload as OnboardingCompletedEmailProps);
    case "onboarding_reminder":
      return renderOnboardingReminderEmail(payload as OnboardingReminderEmailProps);
    case "band_application_received":
      return renderBandApplicationReceivedEmail(payload as BandApplicationReceivedEmailProps);
    case "band_application_approved":
      return renderBandApplicationApprovedEmail(payload as BandApplicationDecisionEmailProps);
    case "band_application_declined":
      return renderBandApplicationDeclinedEmail(payload as BandApplicationDecisionEmailProps);
    case "band_application_confirmation":
      return renderBandApplicationConfirmationEmail(
        payload as BandApplicationConfirmationEmailProps,
      );
    case "crew_application_received":
      return renderCrewApplicationReceivedEmail(payload as CrewApplicationReceivedEmailProps);
    case "crew_application_closed":
      return renderCrewApplicationClosedEmail(payload as CrewApplicationClosedEmailProps);
    case "crew_application_confirmation":
      return renderCrewApplicationConfirmationEmail(
        payload as CrewApplicationConfirmationEmailProps,
      );
    case "crew_trainee_intro":
      return renderCrewTraineeIntroEmail(payload as CrewTraineeIntroEmailProps);
    case "rental_outbound_packed":
      return renderRentalOutboundPackedEmail(payload as RentalOutboundPackedEmailProps);
    case "rental_return_processed":
      return renderRentalReturnProcessedEmail(payload as RentalReturnProcessedEmailProps);
    case "post_event_album":
      return renderPostEventAlbumEmail(payload as PostEventAlbumEmailProps);
    case "event_comment_mention":
      return renderEventCommentMentionEmail(payload as EventCommentMentionEmailProps);
    case "comment_mention":
      return renderCommentMentionEmail(payload as CommentMentionEmailProps);
  }
}
