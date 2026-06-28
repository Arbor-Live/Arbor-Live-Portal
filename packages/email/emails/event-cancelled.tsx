import { Section, Text } from "@react-email/components";
import { CtaButton, EmailLayout, EventDetailsSection } from "./components/email-layout";
import type { EventEmailProps } from "../src/types";

export function EventCancelledEmail({
  eventTitle,
  venueName,
  dateRangeLabel,
  eventUrl,
  recipientName,
}: EventEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";

  return (
    <EmailLayout preview={`${eventTitle} has been cancelled`} heading="Event cancelled">
      <Text style={textStyle}>{greeting}</Text>
      <Text style={textStyle}>
        This event has been marked as cancelled in Arbor Live. Please disregard any previous
        scheduling details.
      </Text>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <CtaButton href={eventUrl} label="View event" />
    </EmailLayout>
  );
}

export default EventCancelledEmail;

const textStyle = {
  color: "#3f3f46",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 16px",
};
