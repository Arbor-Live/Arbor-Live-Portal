import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
} from "./_components/email-layout";
import type { BookingRequestDeclinedEmailProps } from "../src/types";

export function BookingRequestDeclinedEmail({
  recipientName,
  requestNumber,
  eventName,
  eventDateText,
  reasonLabel,
  reasonNote,
  trackingUrl,
}: BookingRequestDeclinedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const subject = eventName?.trim() || requestNumber;

  return (
    <EmailLayout
      preview={`Update on your request: ${subject}`}
      heading="Update on your request"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        We&apos;re not able to take on <strong>{subject}</strong> as requested. You can view the
        details and any notes from our team on your request page.
      </BodyCopy>
      <DataCard title="Request Summary">
        <DetailRow label="Request" value={requestNumber} />
        {eventName ? <DetailRow label="Event" value={eventName} /> : null}
        <DetailRow label="Date" value={eventDateText} />
        <DetailRow label="Reason" value={reasonLabel} />
        {reasonNote ? <DetailRow label="Note" value={reasonNote} /> : null}
      </DataCard>
      <CtaButton href={trackingUrl} label="View request" />
      <EmailSignOff />
    </EmailLayout>
  );
}

BookingRequestDeclinedEmail.PreviewProps = {
  recipientName: "Jordan Lee",
  requestNumber: "ALREQ-4K8Z2NP",
  eventName: "Spring Concert 2026",
  eventDateText: "Saturday, Apr 12, 2026",
  reasonLabel: "At capacity / unavailable",
  reasonNote: "We're already fully booked that weekend.",
  trackingUrl: "http://localhost:3000/request/track/demo",
} satisfies BookingRequestDeclinedEmailProps;

export default BookingRequestDeclinedEmail;
