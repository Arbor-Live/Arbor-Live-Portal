import { render } from "@react-email/render";
import { BookingQuoteReadyEmail } from "../emails/booking-quote-ready";
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
import { SchedulePublishedEmail } from "../emails/schedule-published";
import { ScheduleReminderEmail } from "../emails/schedule-reminder";
import { UserInviteEmail } from "../emails/user-invite";
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
  SchedulePublishedEmailProps,
  ScheduleReminderEmailProps,
  UserInviteEmailProps,
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
