import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
} from "./components/email-layout";
import type { EventEmailProps } from "../src/types";

export function EventCancelledEmail({
  eventTitle,
  venueName,
  dateRangeLabel,
  eventUrl,
  recipientName,
}: EventEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout preview={`${eventTitle} has been cancelled`} heading="Event Cancelled">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        This event has been marked as cancelled in Arbor Live. Please disregard any previous
        scheduling details or crew assignments.
      </BodyCopy>
      <EventDetailsSection
        title="Cancelled Event"
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <CtaButton href={eventUrl} label="View event in portal" />
      <EmailSignOff />
    </EmailLayout>
  );
}

export default EventCancelledEmail;
