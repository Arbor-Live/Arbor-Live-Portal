import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  MutedCopy,
} from "./components/email-layout";
import type { EmailVerificationEmailProps } from "../src/types";

export function EmailVerificationEmail({
  recipientName,
  verificationUrl,
}: EmailVerificationEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout preview="Verify your Arbor Live email" heading="Verify Your Email">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        Please confirm this email address for your Arbor Live account by clicking the button below.
      </BodyCopy>
      <MutedCopy>If you did not request this, you can safely ignore this email.</MutedCopy>
      <CtaButton href={verificationUrl} label="Verify email" />
      <EmailSignOff />
    </EmailLayout>
  );
}

export default EmailVerificationEmail;
