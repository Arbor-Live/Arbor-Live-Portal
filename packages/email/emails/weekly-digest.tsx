import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  MutedCopy,
  ScheduleTimeline,
} from "./_components/email-layout";
import type { WeeklyDigestEmailProps } from "../src/types";

export function WeeklyDigestEmail({
  recipientName,
  sections,
  dashboardUrl,
}: WeeklyDigestEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const total = sections.reduce((count, section) => count + section.items.length, 0);

  return (
    <EmailLayout
      preview="Your pending Arbor Live activity for the week"
      heading="Your week at a glance"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        {total === 1
          ? "One thing is waiting on you this week."
          : `${total} things are waiting on you this week.`}
      </BodyCopy>
      {sections.map((section) => (
        <ScheduleTimeline key={section.title} items={section.items} title={section.title} />
      ))}
      <CtaButton href={dashboardUrl} label="Open the portal" />
      <MutedCopy>
        You receive this digest as part of your Arbor Live participation. An admin can turn it off
        from your profile under Participation.
      </MutedCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

WeeklyDigestEmail.PreviewProps = {
  recipientName: "Alex",
  sections: [
    {
      title: "Availability — 3 responses needed",
      items: [
        "Spring Showcase • Fri, May 9, 7:00 PM",
        "Outdoor Concert • Sat, May 10, 5:30 PM",
      ],
    },
    { title: "Your events this week — 1 event", items: ["Trivia Night • Wed, May 7, 6:00 PM"] },
    { title: "Booking requests — 2 open requests", items: ["Grad Formal • ALREQ-4K8Z2NP"] },
  ],
  dashboardUrl: "http://localhost:3000/dashboard",
} satisfies WeeklyDigestEmailProps;

export default WeeklyDigestEmail;
