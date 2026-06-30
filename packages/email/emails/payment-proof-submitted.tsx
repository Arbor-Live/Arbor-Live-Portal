import { Text } from "@react-email/components";
import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
  HighlightBox,
} from "./components/email-layout";
import type { PaymentProofSubmittedEmailProps } from "../src/types";

function currency(value: number) {
  return `$${value.toFixed(2)}`;
}

export function PaymentProofSubmittedEmail({
  recipientName,
  eventTitle,
  venueName,
  dateRangeLabel,
  invoiceNumber,
  quoteTotalUsd,
  paymentMethodLabel,
  paymentReference,
  financeContactEmail,
  portalUrl,
  managerName,
  managerEmail,
}: PaymentProofSubmittedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout preview={`Payment proof received for ${eventTitle}`} heading="Payment Proof Received">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        We received your payment proof submission for {eventTitle}. Our team will verify the payment
        against the invoice total.
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <HighlightBox title="Submission Details">
        <Text style={highlightLineStyle}>
          <strong>Quote:</strong> {invoiceNumber}
        </Text>
        <Text style={highlightLineStyle}>
          <strong>Total:</strong> {currency(quoteTotalUsd)}
        </Text>
        <Text style={highlightLineStyle}>
          <strong>Payment method:</strong> {paymentMethodLabel}
        </Text>
        <Text style={highlightLineStyle}>
          <strong>Reference:</strong> {paymentReference}
        </Text>
        {financeContactEmail ? (
          <Text style={highlightLineStyle}>
            <strong>Payment submitter:</strong> {financeContactEmail}
          </Text>
        ) : null}
      </HighlightBox>
      <BodyCopy>
        Questions? Reply to this email or contact {managerName}
        {managerEmail ? ` at ${managerEmail}` : ""}.
      </BodyCopy>
      <CtaButton href={portalUrl} label="View event portal" />
      <EmailSignOff />
    </EmailLayout>
  );
}

export default PaymentProofSubmittedEmail;

const highlightLineStyle = {
  color: "#ffffff",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 8px",
};
