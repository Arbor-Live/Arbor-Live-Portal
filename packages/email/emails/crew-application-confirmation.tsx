import { BodyCopy, EmailLayout, EmailSignOff } from "./_components/email-layout";
import type { CrewApplicationConfirmationEmailProps } from "../src/types";

export function CrewApplicationConfirmationEmail({
  recipientName,
  vertical,
}: CrewApplicationConfirmationEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  return (
    <EmailLayout preview="We got your Arbor Live crew application" heading="Thanks for applying">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        We received your application to join Arbor Live
        {vertical ? (
          <>
            {" "}
            on the <strong>{vertical}</strong> team
          </>
        ) : null}
        . Our team reviews every submission and we&apos;ll follow up by email when there&apos;s a
        next step.
      </BodyCopy>
      <BodyCopy>Thanks for wanting to be part of the crew — we can&apos;t wait to meet you.</BodyCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

CrewApplicationConfirmationEmail.PreviewProps = {
  recipientName: "Jordan",
  vertical: "Crew",
} satisfies CrewApplicationConfirmationEmailProps;

export default CrewApplicationConfirmationEmail;
