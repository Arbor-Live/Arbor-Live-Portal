import { Text } from "@react-email/components";
import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  HighlightBox,
} from "./components/email-layout";
import type { BookingRequestReceivedEmailProps } from "../src/types";

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
      <HighlightBox title="Request Summary">
        <Text style={highlightLineStyle}>
          <strong>Request:</strong> {requestNumber}
        </Text>
        <Text style={highlightLineStyle}>
          <strong>Event:</strong> {eventName}
        </Text>
        <Text style={highlightLineStyle}>
          <strong>Date:</strong> {eventDateText}
        </Text>
      </HighlightBox>
      <BodyCopy>
        Use your request tracker anytime to check status, review your quote, and approve when you are
        ready.
      </BodyCopy>
      <CtaButton href={trackingUrl} label="Open request tracker" />
      <EmailSignOff />
    </EmailLayout>
  );
}

export default BookingRequestReceivedEmail;

const highlightLineStyle = {
  color: "#ffffff",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 8px",
};
