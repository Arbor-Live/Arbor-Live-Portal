import { Text } from "@react-email/components";
import {
  BodyCopy,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
  HighlightBox,
  MutedCopy,
} from "./components/email-layout";
import type { PayingPartyAddedEmailProps } from "../src/types";

function currency(value: number) {
  return `$${value.toFixed(2)}`;
}

export function PayingPartyAddedEmail({
  recipientName,
  approvedByName,
  clientGroupName,
  eventTitle,
  venueName,
  dateRangeLabel,
  invoiceNumber,
  quoteTotalUsd,
  managerName,
  managerEmail,
}: PayingPartyAddedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const approverLabel = clientGroupName
    ? `${approvedByName} (${clientGroupName})`
    : approvedByName;

  return (
    <EmailLayout
      preview={`You've been added as the paying party for ${eventTitle}`}
      heading="Added as Paying Party"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        {approverLabel} added you as the Financial Officer or Paying party for an Arbor Live event.
        The quote has been approved, and you will receive a finalized invoice after the event with
        payment instructions.
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <HighlightBox title="Approved quote">
        <Text style={highlightLineStyle}>
          <strong>Quote:</strong> {invoiceNumber}
        </Text>
        <Text style={highlightLineStyle}>
          <strong>Total:</strong> {currency(quoteTotalUsd)}
        </Text>
        <Text style={highlightLineStyle}>
          <strong>Approved by:</strong> {approvedByName}
        </Text>
      </HighlightBox>
      <BodyCopy>
        We will follow up after the event with the finalized invoice and details for submitting payment
        proof. If you have questions in the meantime, contact {managerName}
        {managerEmail ? ` at ${managerEmail}` : ""}.
      </BodyCopy>
      <MutedCopy>
        You are receiving this because you were listed as the paying party for this event.
      </MutedCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

export default PayingPartyAddedEmail;

const highlightLineStyle = {
  color: "#ffffff",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "0 0 8px",
};
