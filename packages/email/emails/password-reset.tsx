import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  MutedCopy,
} from "./_components/email-layout";
import type { PasswordResetEmailProps } from "../src/types";
import { passwordResetPreviewProps } from "./_preview-props";

export function PasswordResetEmail({
  recipientName,
  resetUrl,
}: PasswordResetEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout preview="Reset your Arbor Live password" heading="Reset Your Password">
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        We received a request to reset the password for your Arbor Live account. Click below to
        choose a new password.
      </BodyCopy>
      <CtaButton href={resetUrl} label="Reset password" />
      <MutedCopy>If you did not request this, you can safely ignore this email.</MutedCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

PasswordResetEmail.PreviewProps = passwordResetPreviewProps;

export default PasswordResetEmail;
