import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
} from "./_components/email-layout";
import type { CommentMentionEmailProps } from "../src/types";

/**
 * Mention notification for non-event comment threads (damage reports, booking
 * requests). Events keep `event-comment-mention.tsx`, which renders the richer
 * venue/date summary this generic template has no way to build.
 */
export function CommentMentionEmail({
  recipientName,
  authorName,
  subjectKindLabel,
  subjectTitle,
  contextRows,
  commentSnippet,
  url,
  ctaLabel,
}: CommentMentionEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout
      preview={`${authorName} mentioned you on ${subjectTitle}`}
      heading="You Were Mentioned"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        <strong>{authorName}</strong> mentioned you in a comment on a{" "}
        {subjectKindLabel.toLowerCase()}.
      </BodyCopy>
      <DataCard title={subjectKindLabel}>
        <DetailRow label={subjectKindLabel} value={subjectTitle} emphasis />
        {contextRows.map((row) => (
          <DetailRow key={row.label} label={row.label} value={row.value} />
        ))}
      </DataCard>
      <DataCard title="Comment" variant="muted">
        <BodyCopy>&ldquo;{commentSnippet}&rdquo;</BodyCopy>
      </DataCard>
      <CtaButton href={url} label={ctaLabel} />
      <EmailSignOff />
    </EmailLayout>
  );
}

CommentMentionEmail.PreviewProps = {
  recipientName: "Jordan",
  authorName: "Alex Chen",
  subjectKindLabel: "Damage report",
  subjectTitle: "ARB-042 · Shure SM58",
  contextRows: [
    { label: "Status", value: "Open · severity 4/5 · needs repair" },
    { label: "Event", value: "Friday Night Live" },
  ],
  commentSnippet: "Capsule is rattling — can we pull a spare before Friday?",
  url: "https://portal.arbor.st/dashboard/inventory/damage?report=demo-report",
  ctaLabel: "View damage report",
} satisfies CommentMentionEmailProps;

export default CommentMentionEmail;
