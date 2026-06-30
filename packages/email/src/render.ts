import { render } from "@react-email/render";
import { BookingQuoteReadyEmail } from "../emails/booking-quote-ready";
import { BookingRequestReceivedEmail } from "../emails/booking-request-received";
import { EventCancelledEmail } from "../emails/event-cancelled";
import { PasswordResetEmail } from "../emails/password-reset";
import { PaymentProofReminderEmail } from "../emails/payment-proof-reminder";
import { PaymentProofSubmittedEmail } from "../emails/payment-proof-submitted";
import { SchedulePublishedEmail } from "../emails/schedule-published";
import { ScheduleReminderEmail } from "../emails/schedule-reminder";
import { UserInviteEmail } from "../emails/user-invite";
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
} from "./types";

export async function renderEventCancelledEmail(props: EventEmailProps) {
  return render(EventCancelledEmail(props));
}

export async function renderSchedulePublishedEmail(props: SchedulePublishedEmailProps) {
  return render(SchedulePublishedEmail(props));
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
