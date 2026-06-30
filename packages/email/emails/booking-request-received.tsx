import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
} from "./_components/email-layout";
import type { BookingRequestReceivedEmailProps } from "../src/types";
import { bookingRequestReceivedPreviewProps } from "./_preview-props";

export function BookingRequestReceivedEmail({
  recipientName,
  requestNumber,
  eventName,
  eventDateText,
  trackingUrl,
}: BookingRequestReceivedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout
      preview={`We received your booking request ${requestNumber}`}
      heading="Request Received"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        Thanks for submitting your event request to Arbor Live. Our team will review the details and
        follow up with a quote when it is ready.
      </BodyCopy>
      <DataCard title="Request Summary">
        <DetailRow label="Request" value={requestNumber} />
        <DetailRow label="Event" value={eventName} />
        <DetailRow label="Date" value={eventDateText} />
      </DataCard>
      <CtaButton href={trackingUrl} label="Track your request" />
      <BodyCopy>
        Use your request tracker anytime to check status, review your quote, and approve when you are
        ready.
      </BodyCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

BookingRequestReceivedEmail.PreviewProps = bookingRequestReceivedPreviewProps;

export default BookingRequestReceivedEmail;
