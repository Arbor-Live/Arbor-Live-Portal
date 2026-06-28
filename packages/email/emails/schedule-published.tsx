import { Section, Text } from "@react-email/components";
import { CtaButton, EmailLayout, EventDetailsSection } from "./components/email-layout";
import type { SchedulePublishedEmailProps } from "../src/types";

export function SchedulePublishedEmail({
  eventTitle,
  venueName,
  dateRangeLabel,
  eventUrl,
  recipientName,
  blockSummaries,
}: SchedulePublishedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi,";

  return (
    <EmailLayout preview={`Schedule published for ${eventTitle}`} heading="Schedule published">
      <Text style={textStyle}>{greeting}</Text>
      <Text style={textStyle}>
        The schedule for this event has been updated. Review the timeline below and confirm your
        assignments in Arbor Live.
      </Text>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      {blockSummaries.length > 0 ? (
        <Section style={listStyle}>
          <Text style={listHeadingStyle}>Schedule blocks</Text>
          {blockSummaries.map((summary: string) => (
            <Text key={summary} style={listItemStyle}>
              • {summary}
            </Text>
          ))}
        </Section>
      ) : null}
      <CtaButton href={eventUrl} label="View schedule" />
    </EmailLayout>
  );
}

export default SchedulePublishedEmail;

const textStyle = {
  color: "#3f3f46",
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 16px",
};

const listStyle = {
  marginBottom: "24px",
};

const listHeadingStyle = {
  color: "#71717a",
  fontSize: "12px",
  fontWeight: "600",
  letterSpacing: "0.04em",
  margin: "0 0 8px",
  textTransform: "uppercase" as const,
};

const listItemStyle = {
  color: "#18181b",
  fontSize: "14px",
  lineHeight: "1.5",
  margin: "0 0 6px",
};
