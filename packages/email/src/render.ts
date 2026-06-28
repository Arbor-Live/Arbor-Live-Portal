import { render } from "@react-email/render";
import { EventCancelledEmail } from "../emails/event-cancelled";
import { SchedulePublishedEmail } from "../emails/schedule-published";
import { ScheduleReminderEmail } from "../emails/schedule-reminder";
import type {
  EventEmailProps,
  SchedulePublishedEmailProps,
  ScheduleReminderEmailProps,
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
