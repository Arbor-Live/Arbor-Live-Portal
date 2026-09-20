import {
  BodyCopy,
  CtaButton,
  EmailLayout,
  EmailSignOff,
  EventDetailsSection,
  MutedCopy,
} from "./_components/email-layout";
import type { PostEventAlbumEmailProps } from "../src/types";

export function PostEventAlbumEmail({
  recipientName,
  eventTitle,
  venueName,
  dateRangeLabel,
  albumShareUrl,
  eventMediaUrl,
  feedbackFormUrl,
  postMortemUrl,
  audience = "client",
}: PostEventAlbumEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const isLead = audience === "lead";
  const isCrew = audience === "crew";
  const isClient = audience === "client";

  const preview = isClient
    ? "Thanks for choosing Arbor Live — share your feedback"
    : `Share your photos from ${eventTitle}`;

  const heading = isLead
    ? "Thanks for Leading the Show!"
    : isCrew
      ? "Thanks for Being Part of the Show!"
      : "Thanks for Choosing Arbor Live!";

  const intro = isLead
    ? `Thanks again for running point on ${eventTitle}! Photos and videos from the event are being uploaded to a shared album.`
    : isCrew
      ? `Thanks again for crewing ${eventTitle}! Our crew will be uploading photos and videos from the event to a shared album over the next few days.`
      : `We hope you enjoyed working with us on ${eventTitle}!`;

  const footer = isLead
    ? "You are receiving this because you led on an Arbor Live event."
    : isCrew
      ? "You are receiving this because you crewed an Arbor Live event."
      : "You are receiving this because Arbor Live produced an event for you.";

  return (
    <EmailLayout preview={preview} heading={heading}>
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>{intro}</BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />

      {isClient ? (
        <>
          <BodyCopy>
            Would you share a quick note on how it went? Your feedback helps us improve how we run
            events for clients like you.
          </BodyCopy>
          {feedbackFormUrl ? (
            <CtaButton href={feedbackFormUrl} label="Share your feedback" />
          ) : null}
        </>
      ) : null}

      {isLead ? null : (
        <BodyCopy>
          {isCrew
            ? "If you captured any photos or videos of your own, we would love it if you added them to the album."
            : "Our crew is uploading photos and videos from the event to a shared album. If you or your team captured any of your own, we would love for you to add them too — it helps us document and prove the impact these events have on campus."}
        </BodyCopy>
      )}
      {isClient ? (
        albumShareUrl ? (
          <CtaButton
            href={albumShareUrl}
            label="View & add to the album"
            variant="secondary"
          />
        ) : (
          <MutedCopy>
            We will follow up with the shared album link as soon as it is ready.
          </MutedCopy>
        )
      ) : eventMediaUrl ? (
        <CtaButton href={eventMediaUrl} label="Upload & view photos" />
      ) : (
        <MutedCopy>
          We will follow up with the shared album link as soon as it is ready.
        </MutedCopy>
      )}

      {isLead ? (
        <>
          <BodyCopy>
            We would also love a quick post-mortem from you — what went well and what we can do
            better for next time. It only takes a minute.
          </BodyCopy>
          {postMortemUrl ? (
            <CtaButton href={postMortemUrl} label="Complete the post-mortem" variant="secondary" />
          ) : null}
        </>
      ) : null}

      <MutedCopy>{footer}</MutedCopy>
      <EmailSignOff />
    </EmailLayout>
  );
}

PostEventAlbumEmail.PreviewProps = {
  recipientName: "Jordan",
  eventTitle: "Friday Night Live",
  venueName: "Tresidder > Arbor Stage",
  dateRangeLabel: "Friday, Oct 10, 2026 • 5:00 PM – 11:00 PM",
  albumShareUrl: "https://photos.arbor.st/share/demo-album",
  feedbackFormUrl: "https://arborlive.stanford.edu/request/track/demo-request#feedback",
  audience: "client",
} satisfies PostEventAlbumEmailProps;

export default PostEventAlbumEmail;
