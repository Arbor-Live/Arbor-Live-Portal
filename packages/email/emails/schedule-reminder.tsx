import { Text } from "@react-email/components";
import { CtaButton, EmailLayout, EventDetailsSection } from "./components/email-layout";
import type { ScheduleReminderEmailProps } from "../src/types";

export function ScheduleReminderEmail({
  eventTitle,
  venueName,
  dateRangeLabel,
  eventUrl,
  recipientName,
  daysUntilEvent,
}: ScheduleReminderEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";
  const dayLabel = daysUntilEvent === 1 ? "1 day" : `${daysUntilEvent} days`;

  return (
    <EmailLayout
      preview={`${eventTitle} needs a schedule (${dayLabel} away)`}
      heading="Schedule reminder"
    >
      <Text style={textStyle}>{greeting}</Text>
      <Text style={textStyle}>
        This event is {dayLabel} away and still does not have a published schedule in Arbor Live.
        Please add schedule blocks so crew can be assigned.
      </Text>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <CtaButton href={eventUrl} label="Add schedule" />
    </EmailLayout>
  );
}

export default ScheduleReminderEmail;

const textStyle = {
  color: "#3f3f46",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 16px",
};
