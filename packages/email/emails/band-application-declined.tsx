import { BodyCopy, EmailLayout, EmailSignOff } from "./_components/email-layout";
import type { BandApplicationDecisionEmailProps } from "../src/types";

export function BandApplicationDeclinedEmail({
  recipientName,
  bandName,
  declineReason,
}: BandApplicationDecisionEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  return (
    <EmailLayout preview={`Update on ${bandName}`} heading="Application update">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        Thanks for applying — we&apos;re not able to move forward with <strong>{bandName}</strong>{" "}
        right now.
      </BodyCopy>
      {declineReason ? <BodyCopy>{declineReason}</BodyCopy> : null}
      <BodyCopy>You&apos;re welcome to reach out if you have questions.</BodyCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

BandApplicationDeclinedEmail.PreviewProps = {
  recipientName: "Alex",
  bandName: "The Redwoods",
  declineReason: "We're at capacity for new artists this quarter.",
} satisfies BandApplicationDecisionEmailProps;

export default BandApplicationDeclinedEmail;
