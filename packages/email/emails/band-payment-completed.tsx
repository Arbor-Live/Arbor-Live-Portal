import {
  AlertBanner,
  BodyCopy,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
  MutedCopy,
} from "./_components/email-layout";
import { currency } from "./_components/format";
import type { BandPaymentCompletedEmailProps } from "../src/types";
import { bandPaymentCompletedPreviewProps } from "./_preview-props";

export function BandPaymentCompletedEmail({
  recipientName,
  bandName,
  eventTitle,
  venueName,
  dateRangeLabel,
  totalUsd,
  servicePaymentNumber,
  designatedPayeeName,
}: BandPaymentCompletedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout preview={`Payment processed for ${eventTitle}`} heading="Band Payment Processed">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        Payment for {bandName}&apos;s performance at {eventTitle} has been submitted through GrantEd.
      </BodyCopy>
      <EventDetailsSection eventTitle={eventTitle} venueName={venueName} dateRangeLabel={dateRangeLabel} />
      <DataCard title="Payment">
        <DetailRow label="Total" value={currency(totalUsd)} emphasis />
        <DetailRow label="Service Payment number" value={servicePaymentNumber} emphasis />
        <DetailRow label="Designated payee" value={designatedPayeeName} />
      </DataCard>
      <AlertBanner>
        Funds were sent to your band&apos;s designated payee ({designatedPayeeName}) for distribution among members.
      </AlertBanner>
      <MutedCopy>You are receiving this because you are a member of {bandName}.</MutedCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

BandPaymentCompletedEmail.PreviewProps = bandPaymentCompletedPreviewProps;

export default BandPaymentCompletedEmail;
