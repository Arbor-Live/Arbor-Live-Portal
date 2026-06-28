import { Text } from "@react-email/components";
import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
  InfoCard,
} from "./components/email-layout";
import { brand } from "./components/brand-theme";
import type { SchedulePublishedEmailProps } from "../src/types";

export function SchedulePublishedEmail({
  eventTitle,
  venueName,
  dateRangeLabel,
  eventUrl,
  recipientName,
  blockSummaries,
}: SchedulePublishedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout preview={`Schedule published for ${eventTitle}`} heading="Schedule Published">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        The schedule for this event has been updated. Review the timeline below and confirm your
        assignments in Arbor Live.
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      {blockSummaries.length > 0 ? (
        <InfoCard>
          <Text style={cardHeadingStyle}>Schedule Blocks</Text>
          {blockSummaries.map((summary: string) => (
            <Text key={summary} style={cardLineStyle}>
              • {summary}
            </Text>
          ))}
        </InfoCard>
      ) : null}
      <CtaButton href={eventUrl} label="View schedule" />
      <EmailSignOff />
    </EmailLayout>
  );
}

export default SchedulePublishedEmail;

const cardHeadingStyle = {
  color: brand.text,
  fontSize: "18px",
  fontWeight: "700",
  lineHeight: "1.3",
  margin: "0 0 12px",
};

const cardLineStyle = {
  color: brand.text,
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0 0 6px",
};
