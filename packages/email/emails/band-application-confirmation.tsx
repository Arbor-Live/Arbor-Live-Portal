import { BodyCopy, EmailLayout, EmailSignOff } from "./_components/email-layout";
import type { BandApplicationConfirmationEmailProps } from "../src/types";

export function BandApplicationConfirmationEmail({
  recipientName,
  bandName,
}: BandApplicationConfirmationEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  return (
    <EmailLayout
      preview={`We got your application for ${bandName}`}
      heading="Thanks for applying"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        We received your application for <strong>{bandName}</strong> to join the live music
        community at Stanford. Our team reviews every submission and we&apos;ll email you when
        there&apos;s a next step.
      </BodyCopy>
      <BodyCopy>
        No action is needed right now. If anything changes on your side, just reply to this email.
      </BodyCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

BandApplicationConfirmationEmail.PreviewProps = {
  recipientName: "Alex",
  bandName: "The Redwoods",
} satisfies BandApplicationConfirmationEmailProps;

export default BandApplicationConfirmationEmail;
