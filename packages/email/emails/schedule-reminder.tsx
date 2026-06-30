import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
} from "./_components/email-layout";
import type { ScheduleReminderEmailProps } from "../src/types";
import { scheduleReminderPreviewProps } from "./_preview-props";

export function ScheduleReminderEmail({
  eventTitle,
  venueName,
  dateRangeLabel,
  eventUrl,
  recipientName,
  daysUntilEvent,
}: ScheduleReminderEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const dayLabel = daysUntilEvent === 1 ? "1 day" : `${daysUntilEvent} days`;

  return (
    <EmailLayout
      preview={`${eventTitle} needs a schedule (${dayLabel} away)`}
      heading="Schedule Reminder"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        This event is {dayLabel} away and still does not have a published schedule in Arbor Live.
        Please add schedule blocks so crew can be assigned.
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <CtaButton href={eventUrl} label="Add schedule" />
      <EmailSignOff />
    </EmailLayout>
  );
}

ScheduleReminderEmail.PreviewProps = scheduleReminderPreviewProps;

export default ScheduleReminderEmail;
