import { render } from "@react-email/render";
import { EventCancelledEmail } from "../emails/event-cancelled";
import { PasswordResetEmail } from "../emails/password-reset";
import { SchedulePublishedEmail } from "../emails/schedule-published";
import { ScheduleReminderEmail } from "../emails/schedule-reminder";
import { UserInviteEmail } from "../emails/user-invite";
import type {
  EventEmailProps,
  PasswordResetEmailProps,
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
