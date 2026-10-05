import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
} from "./_components/email-layout";
import type { BandScheduledEmailProps } from "../src/types";
import { bandScheduledPreviewProps } from "./_preview-props";

export function BandScheduledEmail({
  recipientName,
  bandName,
  eventTitle,
  venueName,
  dateRangeLabel,
  slotLabel,
  timeRangeLabel,
  isUpdate,
  otherSlotSummary,
  showUrl,
}: BandScheduledEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";
  const slot = slotLabel.toLowerCase();
  const heading = isUpdate ? `${slotLabel} Time Changed` : `${slotLabel} Time Set`;
  const intro = isUpdate
    ? `${bandName}'s ${slot} time for this show has changed. The attached calendar invite updates the one you already have.`
    : `${bandName}'s ${slot} time for this show is set. A calendar invite is attached to this email.`;

  return (
    <EmailLayout preview={`${slotLabel}: ${eventTitle} • ${timeRangeLabel}`} heading={heading}>
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>{intro}</BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <DataCard title="Your times">
        <DetailRow label={slotLabel} value={timeRangeLabel} emphasis />
        {otherSlotSummary ? <DetailRow label="Also" value={otherSlotSummary} /> : null}
      </DataCard>
      <CtaButton href={showUrl} label="View your show" />
      <EmailSignOff />
    </EmailLayout>
  );
}

BandScheduledEmail.PreviewProps = bandScheduledPreviewProps;

export default BandScheduledEmail;
