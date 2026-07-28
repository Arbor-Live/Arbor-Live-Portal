import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EventDetailsSection,
  MutedCopy,
} from "./_components/email-layout";
import type { BandPaymentPayeeRequiredEmailProps } from "../src/types";
import { bandPaymentPayeeRequiredPreviewProps } from "./_preview-props";

export function BandPaymentPayeeRequiredEmail({
  recipientName,
  bandName,
  eventTitle,
  venueName,
  eventDateLabel,
  payeeSettingsUrl,
}: BandPaymentPayeeRequiredEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";

  return (
    <EmailLayout preview={`Payment payee info needed for ${eventTitle}`} heading="Payment Payee Required">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        Your band ({bandName}) performed at an Arbor Live event and we&apos;re ready to begin payment
        processing. Before we can send a signature request, we need a designated payee on file
        with a mailing address.
      </BodyCopy>
      <EventDetailsSection eventTitle={eventTitle} venueName={venueName} dateRangeLabel={eventDateLabel} />
      <DataCard title="What we need">
        <DetailRow label="Designated payee" value="One band member who receives and distributes payment" />
        <DetailRow label="Payee email" value="Used for signature request notifications" />
        <DetailRow
          label="Payout method"
          value="Pickup from the ASSU office (recommended) or delivery"
        />
        <DetailRow
          label="Mailing address"
          value="Required either way — prefer an off-campus personal address, not a Stanford mailbox or dorm"
        />
      </DataCard>
      <CtaButton href={payeeSettingsUrl} label="Set up payment payee" />
      <BodyCopy>
        Once your payee information is saved, our team can send a signature request and move
        your payout forward.
      </BodyCopy>
      <BodyCopy>
        If the same payee receives more than $2,000 in total across the calendar year from any
        Stanford VSO (not just Arbor Live), Stanford will issue them a Form 1099. Bands may want
        to rotate the designated payee among members to stay under that threshold.
      </BodyCopy>
      <MutedCopy>You are receiving this because your band has a pending Arbor Live payout.</MutedCopy>
    </EmailLayout>
  );
}

BandPaymentPayeeRequiredEmail.PreviewProps = bandPaymentPayeeRequiredPreviewProps;

export default BandPaymentPayeeRequiredEmail;
