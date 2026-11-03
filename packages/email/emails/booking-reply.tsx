import { BodyCopy, CtaButton, EmailLayout } from "./_components/email-layout";
import type { BookingReplyEmailProps } from "../src/types";
import { bookingReplyPreviewProps } from "./_preview-props";

export function BookingReplyEmail({ body, senderName, portalUrl, portalLabel }: BookingReplyEmailProps) {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <EmailLayout
      heading={null}
      preview={paragraphs[0]?.split("\n")[0] ?? `A message from ${senderName ?? "Arbor Live"}`}
    >
      {senderName ? <BodyCopy>{`Message from ${senderName}`}</BodyCopy> : null}
      {paragraphs.map((paragraph, index) => (
        <BodyCopy key={index}>
          {paragraph.split("\n").map((line, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </BodyCopy>
      ))}
      <BodyCopy>
        {senderName ? (
          <>
            {senderName}
            <br />
          </>
        ) : null}
        Arbor Live
      </BodyCopy>
      {portalUrl ? <CtaButton href={portalUrl} label={portalLabel ?? "Open your request"} variant="secondary" /> : null}
    </EmailLayout>
  );
}

BookingReplyEmail.PreviewProps = bookingReplyPreviewProps;

export default BookingReplyEmail;
