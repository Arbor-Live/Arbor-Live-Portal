import { Text } from "@react-email/components";
import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  HighlightBox,
  MutedCopy,
} from "./components/email-layout";
import type { BookingQuoteReadyEmailProps } from "../src/types";

function currency(value: number) {
  return `$${value.toFixed(2)}`;
}

export function BookingQuoteReadyEmail({
  recipientName,
  requestNumber,
  eventName,
  invoiceNumber,
  quoteTotalUsd,
  trackingUrl,
  managerName,
  managerEmail,
}: BookingQuoteReadyEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout preview={`Your quote for ${eventName ?? requestNumber} is ready`} heading="Quote Ready">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        Your Arbor Live quote is ready for review. We attached a PDF copy of the invoice for easy
        reference, and you can review or approve the quote on your request tracker.
      </BodyCopy>
      <HighlightBox title="Quote Summary">
        <Text style={highlightLineStyle}>
          <strong>Request:</strong> {requestNumber}
        </Text>
        {eventName ? (
          <Text style={highlightLineStyle}>
            <strong>Event:</strong> {eventName}
          </Text>
        ) : null}
        <Text style={highlightLineStyle}>
          <strong>Quote:</strong> {invoiceNumber}
        </Text>
        <Text style={highlightLineStyle}>
          <strong>Total:</strong> {currency(quoteTotalUsd)}
        </Text>
        <Text style={highlightLineStyle}>
          <strong>Manager:</strong> {managerName}
          {managerEmail ? ` (${managerEmail})` : ""}
        </Text>
      </HighlightBox>
      <BodyCopy>
        Questions or concerns? Reply to this email and your message will go to {managerName}
        {managerEmail ? ` at ${managerEmail}` : ""}.
      </BodyCopy>
      <MutedCopy>A PDF copy of the quote is attached to this email.</MutedCopy>
      <CtaButton href={trackingUrl} label="Review quote on request tracker" />
      <EmailSignOff />
    </EmailLayout>
  );
}

export default BookingQuoteReadyEmail;

const highlightLineStyle = {
  color: "#ffffff",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 8px",
};
