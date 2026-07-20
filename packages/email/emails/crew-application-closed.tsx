import { BodyCopy, EmailLayout, EmailSignOff } from "./_components/email-layout";
import type { CrewApplicationClosedEmailProps } from "../src/types";

export function CrewApplicationClosedEmail({ recipientName }: CrewApplicationClosedEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  return (
    <EmailLayout preview="Update on your Arbor Live crew application" heading="Application update">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        Your application to join Arbor Live has been closed. We appreciate your interest and wish
        you the best.
      </BodyCopy>
      <BodyCopy>You&apos;re welcome to reach out if you have questions in the future.</BodyCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

CrewApplicationClosedEmail.PreviewProps = {
  recipientName: "Jordan",
} satisfies CrewApplicationClosedEmailProps;

export default CrewApplicationClosedEmail;
