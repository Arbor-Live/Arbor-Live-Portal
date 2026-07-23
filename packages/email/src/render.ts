import { render } from "@react-email/render";
import { BookingQuoteReadyEmail } from "../emails/booking-quote-ready";
import { BookingRequestAdminEmail } from "../emails/booking-request-admin";
import { BookingRequestReceivedEmail } from "../emails/booking-request-received";
import { EventCancelledEmail } from "../emails/event-cancelled";
import { PasswordResetEmail } from "../emails/password-reset";
import { EmailVerificationEmail } from "../emails/email-verification";
import { ChangeEmailConfirmationEmail } from "../emails/change-email-confirmation";
import { PayingPartyAddedEmail } from "../emails/paying-party-added";
import { BandPaymentConfirmationEmail } from "../emails/band-payment-confirmation";
import { BandPaymentCompletedEmail } from "../emails/band-payment-completed";
import { BandPaymentPayeeRequiredEmail } from "../emails/band-payment-payee-required";
import { PaymentProofReminderEmail } from "../emails/payment-proof-reminder";
import { PaymentProofSubmittedEmail } from "../emails/payment-proof-submitted";
import { CrewScheduledEmail } from "../emails/crew-scheduled";
import { CrewUnscheduledEmail } from "../emails/crew-unscheduled";
import { SchedulePublishedEmail } from "../emails/schedule-published";
import { ScheduleReminderEmail } from "../emails/schedule-reminder";
import { UserInviteEmail } from "../emails/user-invite";
import { OnboardingCompletedEmail } from "../emails/onboarding-completed";
import { OnboardingReminderEmail } from "../emails/onboarding-reminder";
import { BandApplicationReceivedEmail } from "../emails/band-application-received";
import { BandApplicationApprovedEmail } from "../emails/band-application-approved";
import { BandApplicationDeclinedEmail } from "../emails/band-application-declined";
import { BandApplicationConfirmationEmail } from "../emails/band-application-confirmation";
import { CrewApplicationReceivedEmail } from "../emails/crew-application-received";
import { CrewApplicationClosedEmail } from "../emails/crew-application-closed";
import { CrewApplicationConfirmationEmail } from "../emails/crew-application-confirmation";
import { CrewTraineeIntroEmail } from "../emails/crew-trainee-intro";
import { RentalOutboundPackedEmail } from "../emails/rental-outbound-packed";
import { RentalReturnProcessedEmail } from "../emails/rental-return-processed";
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
} from "./types";

export async function renderEventCancelledEmail(props: EventEmailProps) {
  return render(EventCancelledEmail(props));
}

export async function renderSchedulePublishedEmail(props: SchedulePublishedEmailProps) {
  return render(SchedulePublishedEmail(props));
}

export async function renderCrewScheduledEmail(props: CrewScheduledEmailProps) {
  return render(CrewScheduledEmail(props));
}

export async function renderCrewUnscheduledEmail(props: CrewUnscheduledEmailProps) {
  return render(CrewUnscheduledEmail(props));
}

export async function renderScheduleReminderEmail(props: ScheduleReminderEmailProps) {
  return render(ScheduleReminderEmail(props));
}

export async function renderUserInviteEmail(props: UserInviteEmailProps) {
  return render(UserInviteEmail(props));
}

export async function renderPasswordResetEmail(props: PasswordResetEmailProps) {
  return render(PasswordResetEmail(props));
}

export async function renderEmailVerificationEmail(props: EmailVerificationEmailProps) {
  return render(EmailVerificationEmail(props));
}

export async function renderChangeEmailConfirmationEmail(props: ChangeEmailConfirmationEmailProps) {
  return render(ChangeEmailConfirmationEmail(props));
}

export async function renderBookingRequestReceivedEmail(props: BookingRequestReceivedEmailProps) {
  return render(BookingRequestReceivedEmail(props));
}

export async function renderBookingRequestAdminEmail(props: BookingRequestAdminEmailProps) {
  return render(BookingRequestAdminEmail(props));
}

export async function renderBookingQuoteReadyEmail(props: BookingQuoteReadyEmailProps) {
  return render(BookingQuoteReadyEmail(props));
}

export async function renderPaymentProofReminderEmail(props: PaymentProofReminderEmailProps) {
  return render(PaymentProofReminderEmail(props));
}

export async function renderPaymentProofSubmittedEmail(props: PaymentProofSubmittedEmailProps) {
  return render(PaymentProofSubmittedEmail(props));
}

export async function renderPayingPartyAddedEmail(props: PayingPartyAddedEmailProps) {
  return render(PayingPartyAddedEmail(props));
}

export async function renderBandPaymentConfirmationEmail(props: BandPaymentConfirmationEmailProps) {
  return render(BandPaymentConfirmationEmail(props));
}

export async function renderBandPaymentCompletedEmail(props: BandPaymentCompletedEmailProps) {
  return render(BandPaymentCompletedEmail(props));
}

export async function renderBandPaymentPayeeRequiredEmail(props: BandPaymentPayeeRequiredEmailProps) {
  return render(BandPaymentPayeeRequiredEmail(props));
}

export async function renderOnboardingCompletedEmail(props: OnboardingCompletedEmailProps) {
  return render(OnboardingCompletedEmail(props));
}

export async function renderOnboardingReminderEmail(props: OnboardingReminderEmailProps) {
  return render(OnboardingReminderEmail(props));
}

export async function renderBandApplicationReceivedEmail(
  props: BandApplicationReceivedEmailProps,
) {
  return render(BandApplicationReceivedEmail(props));
}

export async function renderBandApplicationApprovedEmail(
  props: BandApplicationDecisionEmailProps,
) {
  return render(BandApplicationApprovedEmail(props));
}

export async function renderBandApplicationDeclinedEmail(
  props: BandApplicationDecisionEmailProps,
) {
  return render(BandApplicationDeclinedEmail(props));
}

export async function renderBandApplicationConfirmationEmail(
  props: BandApplicationConfirmationEmailProps,
) {
  return render(BandApplicationConfirmationEmail(props));
}

export async function renderCrewApplicationReceivedEmail(
  props: CrewApplicationReceivedEmailProps,
) {
  return render(CrewApplicationReceivedEmail(props));
}

export async function renderCrewApplicationClosedEmail(props: CrewApplicationClosedEmailProps) {
  return render(CrewApplicationClosedEmail(props));
}

export async function renderCrewApplicationConfirmationEmail(
  props: CrewApplicationConfirmationEmailProps,
) {
  return render(CrewApplicationConfirmationEmail(props));
}

export async function renderCrewTraineeIntroEmail(props: CrewTraineeIntroEmailProps) {
  return render(CrewTraineeIntroEmail(props));
}

export async function renderRentalOutboundPackedEmail(props: RentalOutboundPackedEmailProps) {
  return render(RentalOutboundPackedEmail(props));
}

export async function renderRentalReturnProcessedEmail(props: RentalReturnProcessedEmailProps) {
  return render(RentalReturnProcessedEmail(props));
}
