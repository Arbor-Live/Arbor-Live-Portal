import {
  renderEventCancelledEmail,
  renderSchedulePublishedEmail,
  renderScheduleReminderEmail,
} from "@arbor/email/render";
import type {
  EventEmailProps,
  SchedulePublishedEmailProps,
  ScheduleReminderEmailProps,
} from "@arbor/email/types";
import type { EmailTemplate } from "./constants";

export async function renderEmailHtml(
  template: EmailTemplate,
  payload: EventEmailProps | SchedulePublishedEmailProps | ScheduleReminderEmailProps,
) {
  switch (template) {
    case "event_cancelled":
      return renderEventCancelledEmail(payload as EventEmailProps);
    case "schedule_published":
      return renderSchedulePublishedEmail(payload as SchedulePublishedEmailProps);
    case "schedule_reminder":
      return renderScheduleReminderEmail(payload as ScheduleReminderEmailProps);
  }
}
