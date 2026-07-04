import {
  BodyCopy,
  DataCard,
  DetailRow,
  EmailLayout,
  EventDetailsSection,
  MutedCopy,
} from "./_components/email-layout";
import { currency } from "./_components/format";
import type { BandPaymentConfirmationEmailProps } from "../src/types";
import { bandPaymentConfirmationPreviewProps } from "./_preview-props";

export function BandPaymentConfirmationEmail({
  recipientName,
  eventTitle,
  venueName,
  eventDateLabel,
  performanceHoursLabel,
  pricingMode,
  ratePerMemberPerHourUsd,
  totalUsd,
  designatedPayeeName,
  photoAlbumUrl,
}: BandPaymentConfirmationEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName}!` : "Hi!";

  return (
    <EmailLayout preview={`Confirm payment details for ${eventTitle}`} heading="Band Payment Confirmation">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        As part of payment processing for your band&apos;s performance, could you confirm the following details are
        accurate?
      </BodyCopy>
      <EventDetailsSection eventTitle={eventTitle} venueName={venueName} dateRangeLabel={eventDateLabel} />
      <DataCard title="Payment details">
        <DetailRow label="Length of performance" value={performanceHoursLabel} />
        {pricingMode === "per_member_hourly" ? (
          <DetailRow label="Rate per person per hour" value={currency(ratePerMemberPerHourUsd ?? 0)} />
        ) : null}
        <DetailRow
          label="Total (paid to you to distribute among your band)"
          value={currency(totalUsd)}
          emphasis
        />
        <DetailRow label="Band designated payee" value={designatedPayeeName} />
      </DataCard>
      <BodyCopy>
        If all these details are correct, reply to this email with your confirmation and we can get started on the
        payment process.
      </BodyCopy>
      {photoAlbumUrl ? (
        <>
          <BodyCopy>
            Additionally, if you have any videos or photos of the event, uploading them to the following photo album
            would be much appreciated!
          </BodyCopy>
          <BodyCopy>{photoAlbumUrl}</BodyCopy>
        </>
      ) : null}
      <MutedCopy>You are receiving this because your band performed at an Arbor Live event.</MutedCopy>
    </EmailLayout>
  );
}

BandPaymentConfirmationEmail.PreviewProps = bandPaymentConfirmationPreviewProps;

export default BandPaymentConfirmationEmail;
