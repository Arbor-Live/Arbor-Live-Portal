import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
} from "./_components/email-layout";
import type { BandAssignedEmailProps } from "../src/types";
import { bandAssignedPreviewProps } from "./_preview-props";

export function BandAssignedEmail({
  recipientName,
  bandName,
  eventTitle,
  venueName,
  dateRangeLabel,
  roleLabel,
  dashboardUrl,
}: BandAssignedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";

  return (
    <EmailLayout preview={`You're on the bill for ${eventTitle}`} heading="You're On the Bill">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        {bandName} has been added to an Arbor Live event. You can view show details and track
        payout status from your band dashboard.
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <DataCard title="Booking">
        <DetailRow label="Your role" value={roleLabel} />
      </DataCard>
      <CtaButton href={dashboardUrl} label="View your shows" />
      <EmailSignOff />
    </EmailLayout>
  );
}

BandAssignedEmail.PreviewProps = bandAssignedPreviewProps;

export default BandAssignedEmail;
