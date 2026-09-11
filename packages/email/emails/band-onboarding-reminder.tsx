import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
} from "./_components/email-layout";
import type { BandOnboardingReminderEmailProps } from "../src/types";

export function BandOnboardingReminderEmail({
  recipientName,
  bandName,
  eventTitle,
  venueName,
  dateRangeLabel,
  onboardingUrl,
}: BandOnboardingReminderEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";

  return (
    <EmailLayout
      preview={`Finish onboarding so ${bandName} can get paid`}
      heading="Finish Artist Onboarding"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        <strong>{bandName}</strong> is on the bill for an Arbor Live event, but artist onboarding is
        still incomplete. You need to finish onboarding — including payout details — before we can
        pay you for this show.
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <DataCard title="Next step">
        <DetailRow label="Required" value="Complete artist onboarding" />
      </DataCard>
      <CtaButton href={onboardingUrl} label="Continue artist onboarding" />
      <EmailSignOff />
    </EmailLayout>
  );
}

BandOnboardingReminderEmail.PreviewProps = {
  recipientName: "Alex",
  bandName: "The Redwoods",
  eventTitle: "Spring Concert",
  venueName: "White Plaza",
  dateRangeLabel: "Fri, May 2, 2026, 7:00 PM – 10:00 PM",
  onboardingUrl: "http://localhost:3000/onboarding/band",
} satisfies BandOnboardingReminderEmailProps;

export default BandOnboardingReminderEmail;
