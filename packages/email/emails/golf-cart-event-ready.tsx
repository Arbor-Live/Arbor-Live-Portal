import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
} from "./_components/email-layout";
import type { GolfCartEventReadyEmailProps } from "../src/types";

export function GolfCartEventReadyEmail({
  eventTitle,
  venueName,
  dateRangeLabel,
  eventUrl,
  setupLabel,
  strikeLabel,
}: GolfCartEventReadyEmailProps) {
  return (
    <EmailLayout preview={`${eventTitle} needs a golf cart`} heading="Golf cart needed">
      <BodyCopy>
        {eventTitle} is ready and needs a golf cart for setup and strike. Please make sure one is
        reserved.
      </BodyCopy>
      <DataCard title="Event">
        <DetailRow label="Event" value={eventTitle} />
        <DetailRow label="Date & time" value={dateRangeLabel} />
        {venueName ? <DetailRow label="Venue" value={venueName} /> : null}
        {setupLabel ? <DetailRow label="Setup" value={setupLabel} /> : null}
        {strikeLabel ? <DetailRow label="Strike" value={strikeLabel} /> : null}
      </DataCard>
      <CtaButton href={eventUrl} label="View event details" />
      <EmailSignOff />
    </EmailLayout>
  );
}

GolfCartEventReadyEmail.PreviewProps = {
  eventTitle: "Spring Showcase",
  venueName: "Frost Amphitheater",
  dateRangeLabel: "Fri, Apr 17 · 7:00 PM – 10:00 PM",
  eventUrl: "http://localhost:3000/dashboard/events/preview",
  setupLabel: "Fri, Apr 17 · 4:00 PM – 7:00 PM",
  strikeLabel: "Fri, Apr 17 · 10:00 PM – 11:00 PM",
} satisfies GolfCartEventReadyEmailProps;

export default GolfCartEventReadyEmail;
