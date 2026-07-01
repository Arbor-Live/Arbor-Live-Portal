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
  eventLeadName,
  assignmentSummaries,
  fullScheduleSummaries,
  coversEntireEvent,
}: CrewScheduledEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const scheduleIntro = coversEntireEvent
    ? "You have been scheduled for the full event. The schedule is listed below and a calendar invite is attached to this email."
    : "You have been scheduled for this event. Your assigned block(s) are listed below, along with the full event schedule. A calendar invite is attached to this email.";

  return (
    <EmailLayout preview={`You're scheduled for ${eventTitle}`} heading="You're Scheduled">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>{scheduleIntro}</BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
        eventLeadName={eventLeadName}
      />
      {assignmentSummaries.length > 0 ? (
        <ScheduleTimeline
          items={assignmentSummaries}
          title={coversEntireEvent ? "Schedule" : "Your assignments"}
        />
      ) : null}
      {!coversEntireEvent && fullScheduleSummaries.length > 0 ? (
        <ScheduleTimeline items={fullScheduleSummaries} title="Full event schedule" />
      ) : null}
      <CtaButton href={eventUrl} label="View event schedule" />
      <EmailSignOff />
    </EmailLayout>
  );
}

CrewScheduledEmail.PreviewProps = crewScheduledPreviewProps;

export default CrewScheduledEmail;
