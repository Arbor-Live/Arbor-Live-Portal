import {
  BodyCopy,
  ContactNote,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
  MutedCopy,
} from "./_components/email-layout";
import { currency } from "./_components/format";
import type { PayingPartyAddedEmailProps } from "../src/types";
import { payingPartyAddedPreviewProps } from "./_preview-props";

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
        {approverLabel} added you as the Financial Officer or paying party for an Arbor Live event.
        The quote has been approved — you&apos;ll receive a finalized invoice after the event with
        payment instructions.
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <DataCard title="Approved Quote">
        <DetailRow label="Quote" value={invoiceNumber} />
        <DetailRow label="Total" value={currency(quoteTotalUsd)} emphasis />
        <DetailRow label="Approved by" value={approvedByName} />
      </DataCard>
      <ContactNote managerName={managerName} managerEmail={managerEmail} />
      <MutedCopy>
        You are receiving this because you were listed as the paying party for this event.
      </MutedCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

PayingPartyAddedEmail.PreviewProps = payingPartyAddedPreviewProps;

export default PayingPartyAddedEmail;
