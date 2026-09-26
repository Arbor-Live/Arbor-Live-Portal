import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
} from "./_components/email-layout";
import type { ArtistNeedInquiryEmailProps } from "../src/types";

export function ArtistNeedInquiryEmail({
  artistName,
  eventTitle,
  dateRangeLabel,
  venueName,
  artistTypeLabel,
  genres,
  message,
  reviewUrl,
}: ArtistNeedInquiryEmailProps) {
  return (
    <EmailLayout
      preview={`${artistName} requested to perform: ${eventTitle}`}
      heading="Artist request to perform"
    >
      <BodyCopy>
        <strong>{artistName}</strong> is interested in an open artist need on{" "}
        <strong>{eventTitle}</strong>.
      </BodyCopy>
      <DataCard title="Event Summary">
        <DetailRow label="Event" value={eventTitle} />
        <DetailRow label="When" value={dateRangeLabel} />
        {venueName ? <DetailRow label="Venue" value={venueName} /> : null}
        <DetailRow label="Looking for" value={artistTypeLabel} />
        {genres ? <DetailRow label="Genres" value={genres} /> : null}
      </DataCard>
      {message ? <BodyCopy>&ldquo;{message}&rdquo;</BodyCopy> : null}
      <CtaButton href={reviewUrl} label="Review on the event" />
      <EmailSignOff />
    </EmailLayout>
  );
}

ArtistNeedInquiryEmail.PreviewProps = {
  artistName: "The Cardinal Trio",
  eventTitle: "Spring Concert 2026",
  dateRangeLabel: "Friday, Apr 11, 2026 • 7:00 PM – 10:00 PM",
  venueName: "Memorial Auditorium",
  artistTypeLabel: "Live band",
  genres: "indie, jazz",
  message: "We'd love to play — our set is an hour of jazz standards.",
  reviewUrl: "http://localhost:3000/dashboard/events/demo/artists",
} satisfies ArtistNeedInquiryEmailProps;

export default ArtistNeedInquiryEmail;
