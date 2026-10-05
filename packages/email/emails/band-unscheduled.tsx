import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
} from "./_components/email-layout";
import type { BandUnscheduledEmailProps } from "../src/types";
import { bandUnscheduledPreviewProps } from "./_preview-props";

export function BandUnscheduledEmail({
  recipientName,
  bandName,
  eventTitle,
  venueName,
  dateRangeLabel,
  slotLabel,
  previousTimeRangeLabel,
  showUrl,
}: BandUnscheduledEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";

  return (
    <EmailLayout
      preview={`${slotLabel} removed: ${eventTitle}`}
      heading={`${slotLabel} Removed`}
      tone="muted"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        {bandName}&apos;s {slotLabel.toLowerCase()} for this show is no longer on the schedule. A
        calendar cancellation is attached so you can remove the previous invite.
      </BodyCopy>
      <EventDetailsSection
        title="Event"
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
        variant="muted"
      />
      <DataCard title="Previous time" variant="muted">
        <DetailRow label={slotLabel} value={previousTimeRangeLabel} />
      </DataCard>
      <CtaButton href={showUrl} label="View your show" variant="secondary" />
      <EmailSignOff />
    </EmailLayout>
  );
}

BandUnscheduledEmail.PreviewProps = bandUnscheduledPreviewProps;

export default BandUnscheduledEmail;
