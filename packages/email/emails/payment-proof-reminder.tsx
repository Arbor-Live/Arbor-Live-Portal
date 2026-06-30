import { Text } from "@react-email/components";
import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
  HighlightBox,
  MutedCopy,
} from "./components/email-layout";
import type { PaymentProofReminderEmailProps } from "../src/types";

function currency(value: number) {
  return `$${value.toFixed(2)}`;
}

export function PaymentProofReminderEmail({
  recipientName,
  eventTitle,
  venueName,
  dateRangeLabel,
  invoiceNumber,
  quoteTotalUsd,
  portalUrl,
  reminderKind,
  lateFeeUsd,
  isOverdue,
}: PaymentProofReminderEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const reminderLabel =
    reminderKind === "first"
      ? "Your quote is approved and payment proof submission is now open."
      : "This is your weekly reminder to submit payment proof for your Arbor Live event.";

  return (
    <EmailLayout preview={`Submit payment proof for ${eventTitle}`} heading="Payment Proof Needed">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>{reminderLabel}</BodyCopy>
      <BodyCopy>
        Please submit the payment reference for your invoice using ASSU ePay, iJournal transfer, or
        GrantEd Group Transfer to VSO #5001. You can review your invoice and download a PDF from your
        event portal.
      </BodyCopy>
      {isOverdue ? (
        <BodyCopy>
          This payment is overdue. Accrued late fees: <strong>{currency(lateFeeUsd)}</strong> ($25/month
          starting the second month after due).
        </BodyCopy>
      ) : null}
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <HighlightBox title="Invoice">
        <Text style={highlightLineStyle}>
          <strong>Quote:</strong> {invoiceNumber}
        </Text>
        <Text style={highlightLineStyle}>
          <strong>Total:</strong> {currency(quoteTotalUsd)}
        </Text>
        {isOverdue ? (
          <Text style={highlightLineStyle}>
            <strong>Late fees accrued:</strong> {currency(lateFeeUsd)}
          </Text>
        ) : null}
      </HighlightBox>
      <CtaButton href={portalUrl} label="Open event portal" />
      <MutedCopy>Download your invoice PDF from the portal before submitting payment.</MutedCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

export default PaymentProofReminderEmail;

const highlightLineStyle = {
  color: "#ffffff",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 8px",
};
