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
  feedbackFormUrl,
  postMortemUrl,
  audience = "client",
}: PostEventAlbumEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";
  const isLead = audience === "lead";

  return (
    <EmailLayout
      preview={`Share your photos from ${eventTitle}`}
      heading={isLead ? "Thanks for Leading the Show!" : "Thanks for Hosting with Arbor Live!"}
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        {isLead
          ? `Thanks again for running point on ${eventTitle}! Photos and videos from the event are being uploaded to a shared album.`
          : "Thanks again for working with Arbor Live on your event! Our crew will be uploading photos and videos from the event to a shared album over the next few days."}
      </BodyCopy>
      <EventDetailsSection
        eventTitle={eventTitle}
        venueName={venueName}
        dateRangeLabel={dateRangeLabel}
      />
      {isLead ? null : (
        <BodyCopy>
          If you or your team captured any photos or videos of your own, we would love it if you
          added them to the album too — it helps us document and prove the impact these events have
          on campus.
        </BodyCopy>
      )}
      {albumShareUrl ? (
        <CtaButton href={albumShareUrl} label="View & add to the album" />
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
      ) : (
        <>
          <BodyCopy>
            We would also love your feedback on how things went. Your insights help us improve how
            we run events for clients like you.
          </BodyCopy>
          {feedbackFormUrl ? (
            <CtaButton href={feedbackFormUrl} label="Share your feedback" variant="secondary" />
          ) : null}
        </>
      )}
      <MutedCopy>
        {isLead
          ? "You are receiving this because you led on an Arbor Live event."
          : "You are receiving this because Arbor Live produced an event for you."}
      </MutedCopy>
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
  audience: "lead",
  postMortemUrl: "https://arborlive.stanford.edu/postmortem/pm_DEMOTOKEN",
} satisfies PostEventAlbumEmailProps;

export default PostEventAlbumEmail;
