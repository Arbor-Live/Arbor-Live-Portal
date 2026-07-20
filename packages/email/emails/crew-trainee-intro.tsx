import { Link } from "@react-email/components";
import { BodyCopy, EmailLayout, EmailSignOff } from "./_components/email-layout";
import type { CrewTraineeIntroEmailProps } from "../src/types";

function roleLabel(role: "event_manager" | "day_of_lead", collapsed: boolean) {
  if (collapsed) return "Event manager & day-of lead";
  return role === "event_manager" ? "Event manager (lead-up)" : "Event lead (day-of)";
}

export function CrewTraineeIntroEmail({
  recipientName,
  eventTitle,
  dateRangeLabel,
  venueName,
  venueAddress,
  venueGoogleMapsUrl,
  storageClosetLabel,
  storageClosetMapsUrl,
  callTimeLabel,
  contacts,
  contactsCollapsed,
  arborContactEmail,
}: CrewTraineeIntroEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi!";

  return (
    <EmailLayout
      preview={`You're training with us: ${eventTitle}`}
      heading="You're training with Arbor Live"
    >
      <BodyCopy>{greeting}</BodyCopy>
      <BodyCopy>
        We&apos;re excited to have you training with us. This email has everything you need for
        your first event — <strong>{eventTitle}</strong>. A calendar invite is attached separately.
      </BodyCopy>

      <BodyCopy>
        <strong>Call time:</strong> {callTimeLabel}
      </BodyCopy>

      <BodyCopy>
        <strong>Meet at storage</strong>
        <br />
        Start at the {storageClosetLabel}.{" "}
        <Link href={storageClosetMapsUrl}>Open in Google Maps</Link>
      </BodyCopy>

      <BodyCopy>
        <strong>Event venue</strong>
        <br />
        {venueName}
        <br />
        {venueAddress}
        {venueGoogleMapsUrl ? (
          <>
            <br />
            <Link href={venueGoogleMapsUrl}>Open in Google Maps</Link>
          </>
        ) : null}
      </BodyCopy>

      <BodyCopy>
        <strong>Event details</strong>
        <br />
        {eventTitle}
        <br />
        {dateRangeLabel}
        <br />
        {venueName}
      </BodyCopy>

      {contacts.map((contact) => (
        <BodyCopy key={`${contact.role}-${contact.email}`}>
          <strong>{roleLabel(contact.role, contactsCollapsed && contacts.length === 1)}</strong>
          <br />
          {contact.name}
          <br />
          <Link href={`mailto:${contact.email}`}>{contact.email}</Link>
          <br />
          <Link href={`tel:${contact.phone}`}>{contact.phone}</Link>
        </BodyCopy>
      ))}

      <BodyCopy>
        Wear dark, comfortable clothes. Bring a charged tablet or phone if you can, and earplugs if
        you have them (Minuendo, Eargasm, or Hearos are solid options). Ask questions anytime —
        we&apos;re glad you&apos;re here.
      </BodyCopy>

      <BodyCopy>
        Running late? Message your event contacts above, or reach Arbor Live at{" "}
        <Link href={`mailto:${arborContactEmail}`}>{arborContactEmail}</Link>.
      </BodyCopy>

      <EmailSignOff />
    </EmailLayout>
  );
}

CrewTraineeIntroEmail.PreviewProps = {
  recipientName: "Jordan",
  eventTitle: "Friday Night Live",
  dateRangeLabel: "Fri, Oct 10, 5:00 PM – 11:00 PM PT",
  venueName: "Tresidder > Arbor Stage",
  venueAddress: "459 Lagunita Dr, Stanford, CA 94305",
  venueGoogleMapsUrl: "https://maps.app.goo.gl/example",
  storageClosetLabel: "Old Union storage closet",
  storageClosetMapsUrl: "https://maps.app.goo.gl/8d2dQF96sLV2QrBk7",
  callTimeLabel: "Fri, Oct 10, 4:30 PM PT",
  contacts: [
    {
      role: "event_manager",
      name: "Alex Kim",
      email: "akim@stanford.edu",
      phone: "650-555-0100",
    },
  ],
  contactsCollapsed: true,
  arborContactEmail: "arborlive@stanford.edu",
} satisfies CrewTraineeIntroEmailProps;

export default CrewTraineeIntroEmail;
