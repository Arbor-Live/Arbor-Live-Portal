import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
} from "./_components/email-layout";
import type { BandEventOnboardingInviteEmailProps } from "../src/types";

export function BandEventOnboardingInviteEmail({
  bandName,
  eventTitle,
  venueName,
  dateRangeLabel,
  roleLabel,
  portalUrl,
}: BandEventOnboardingInviteEmailProps) {
  return (
    <EmailLayout preview={`Join ${bandName} on the bill for ${eventTitle}`} heading="You're On the Bill">
      <BodyCopy>
        Arbor Live added <strong>{bandName}</strong> to an upcoming event. Check your inbox for a
        separate portal invite, then finish band onboarding — including payout details — before we
        can pay you for this show.
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      <DataCard title="Booking">
        <DetailRow label="Your role" value={roleLabel} />
      </DataCard>
      <CtaButton href={portalUrl} label="Finish band onboarding" />
      <EmailSignOff />
    </EmailLayout>
  );
}

BandEventOnboardingInviteEmail.PreviewProps = {
  bandName: "The Redwoods",
  eventTitle: "Spring Concert",
  venueName: "White Plaza",
  dateRangeLabel: "Fri, May 2, 2026, 7:00 PM – 10:00 PM",
  roleLabel: "Headliner",
  portalUrl: "http://localhost:3000/sign-in",
} satisfies BandEventOnboardingInviteEmailProps;

export default BandEventOnboardingInviteEmail;
