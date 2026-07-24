import {
  BodyCopy,
  CtaButton,
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
  signUrl,
}: BandPaymentConfirmationEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName}!` : "Hi!";

  return (
    <EmailLayout
      preview={`Payment ready for your signature: ${eventTitle}`}
      heading="Band Payment Ready for Signature"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        A payment for your band&apos;s performance is ready for your e-signature. Please review the
        details below and sign in the Arbor Live portal to confirm the amount.
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
      <CtaButton href={signUrl} label="Review and e-sign payment" />
      <BodyCopy>
        Only the designated payee can sign. Once signed, our team will submit the payout and notify
        your band when it is being processed.
      </BodyCopy>
      {photoAlbumUrl ? (
        <>
          <BodyCopy>
            Additionally, if you have any videos or photos of the event, uploading them to the following
            photo album would be much appreciated!
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
