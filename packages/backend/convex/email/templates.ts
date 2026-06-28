import {
  renderEventCancelledEmail,
  renderPasswordResetEmail,
  renderSchedulePublishedEmail,
  renderScheduleReminderEmail,
  renderUserInviteEmail,
} from "@arbor/email/render";
import type {
  EventEmailProps,
  PasswordResetEmailProps,
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
  }
}
