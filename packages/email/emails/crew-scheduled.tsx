import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
  ScheduleTimeline,
} from "./_components/email-layout";
import type { CrewScheduledEmailProps } from "../src/types";
import { crewScheduledPreviewProps } from "./_preview-props";

export function CrewScheduledEmail({
  eventTitle,
  venueName,
  dateRangeLabel,
  eventUrl,
  recipientName,
  assignmentSummaries,
  fullScheduleSummaries,
}: CrewScheduledEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout preview={`You're scheduled for ${eventTitle}`} heading="You're Scheduled">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        You have been scheduled for this event. Your assigned block(s) are listed below, along with
        the full event schedule. A calendar invite is attached to this email.
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      {assignmentSummaries.length > 0 ? (
        <ScheduleTimeline items={assignmentSummaries} title="Your assignments" />
      ) : null}
      {fullScheduleSummaries.length > 0 ? (
        <ScheduleTimeline items={fullScheduleSummaries} title="Full event schedule" />
      ) : null}
      <CtaButton href={eventUrl} label="View event schedule" />
      <EmailSignOff />
    </EmailLayout>
  );
}

CrewScheduledEmail.PreviewProps = crewScheduledPreviewProps;

export default CrewScheduledEmail;
