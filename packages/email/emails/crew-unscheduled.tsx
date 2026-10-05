import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
  ScheduleTimeline,
} from "./_components/email-layout";
import type { CrewUnscheduledEmailProps } from "../src/types";
import { crewUnscheduledPreviewProps } from "./_preview-props";

export function CrewUnscheduledEmail({
  eventTitle,
  venueName,
  dateRangeLabel,
  eventUrl,
  recipientName,
  eventLeadName,
  previousAssignmentSummaries,
  remainingAssignmentSummaries,
  replacedBySeparateInvites,
}: CrewUnscheduledEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const keepsOtherBlocks = (remainingAssignmentSummaries?.length ?? 0) > 0;
  const intro = replacedBySeparateInvites
    ? "We now send a separate calendar invite for each stretch of shifts you work. This cancels your earlier combined invite for this event; your new invites arrive in separate emails."
    : keepsOtherBlocks
      ? "Part of your crew schedule for this event was removed. A calendar cancellation for those blocks is attached; your other invites for this event still stand."
      : "You have been removed from the crew schedule for this event. A calendar cancellation is attached so you can remove the previous invite from your calendar.";

  return (
    <EmailLayout
      preview={
        replacedBySeparateInvites
          ? `Your calendar invites for ${eventTitle} are now one per shift block`
          : `You're no longer scheduled for ${eventTitle}`
      }
      heading={replacedBySeparateInvites ? "Calendar Invite Replaced" : "Schedule Removed"}
      tone="muted"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>{intro}</BodyCopy>
      <EventDetailsSection
        title="Event"
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
        eventLeadName={eventLeadName}
        variant="muted"
      />
      {!replacedBySeparateInvites && previousAssignmentSummaries.length > 0 ? (
        <ScheduleTimeline
          items={previousAssignmentSummaries}
          title={keepsOtherBlocks ? "Removed" : "Previous assignments"}
        />
      ) : null}
      {keepsOtherBlocks ? (
        <ScheduleTimeline
          items={remainingAssignmentSummaries!}
          title={replacedBySeparateInvites ? "Your schedule" : "Still scheduled"}
        />
      ) : null}
      <CtaButton href={eventUrl} label="View event details" variant="secondary" />
      <EmailSignOff />
    </EmailLayout>
  );
}

CrewUnscheduledEmail.PreviewProps = crewUnscheduledPreviewProps;

export default CrewUnscheduledEmail;
