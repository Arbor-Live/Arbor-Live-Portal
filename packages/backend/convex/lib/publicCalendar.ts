import { PORTAL_TIMEZONE } from "@arbor/format";

/**
 * Builds the public, subscribable calendar feed at `/calendar.ics`.
 *
 * This is deliberately separate from `@arbor/email/ics` (transactional invites):
 * a subscription feed uses `METHOD:PUBLISH`, has no attendee/organizer RSVP
 * semantics, and carries location hints that calendar clients understand
 * (GEO, URL, X-APPLE-STRUCTURED-LOCATION) so a tap opens maps or the event page.
 */

export type PublicCalendarEvent = {
  /** Stable across edits so subscribed calendars update instead of duplicating. */
  uid: string;
  title: string;
  /** Epoch ms. */
  startAt: number;
  endAt: number;
  /** Human-readable location, e.g. "Memorial Church, 450 Jane Stanford Way". */
  location?: string;
  /** Public event page URL. */
  url?: string;
  /** Google Maps link, when the venue has one. */
  mapsUrl?: string;
  /** Event summary/description. */
  description?: string;
  /** Last modification, used for SEQUENCE/LAST-MODIFIED. */
  updatedAt?: number;
};

export type IcsGeo = { lat: number; lng: number };

export type BuildPublicCalendarInput = {
  events: PublicCalendarEvent[];
  /** Calendar display name, e.g. "Arbor Live Events". */
  calendarName: string;
  timezone?: string;
  /** Feed refresh hint, e.g. "PT1H". */
  refreshInterval?: string;
  /** Vertical geo is not stored on venues today; omit unless known. */
  storeLocation?: IcsGeo;
};

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** RFC 5545 folds lines at 75 octets; continuation lines start with a space.
 *  Lengths are UTF-8 octets, not JS code units, and splits never land inside a
 *  surrogate pair. */
function foldIcsLine(line: string) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  // First line has a 75-octet budget; continuations lose one octet to the
  // leading space. Track separately so we never exceed either.
  let budget = 75;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > budget) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
      budget = 74; // continuation lines are prefixed with a space
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current) chunks.push(current);

  return chunks.map((chunk, index) => (index === 0 ? chunk : ` ${chunk}`)).join("\r\n");
}

function formatIcsUtcDateTime(ms: number) {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

function buildVeventLines(event: PublicCalendarEvent, now: number) {
  const lines = [
    "BEGIN:VEVENT",
    foldIcsLine(`UID:${escapeIcsText(event.uid)}`),
    foldIcsLine(`DTSTAMP:${formatIcsUtcDateTime(now)}`),
    // UTC instants (Z suffix) rather than TZID: RFC 5545 requires a matching
    // VTIMEZONE for every TZID, and Outlook desktop misreads bare IANA TZIDs
    // as floating time. Converting the instant keeps DST correct everywhere.
    foldIcsLine(`DTSTART:${formatIcsUtcDateTime(event.startAt)}`),
    foldIcsLine(`DTEND:${formatIcsUtcDateTime(event.endAt)}`),
    foldIcsLine(`SUMMARY:${escapeIcsText(event.title)}`),
    "TRANSP:OPAQUE",
    "STATUS:CONFIRMED",
  ];

  if (event.updatedAt) {
    lines.push(foldIcsLine(`LAST-MODIFIED:${formatIcsUtcDateTime(event.updatedAt)}`));
  }
  if (event.description?.trim()) {
    lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(event.description.trim())}`));
  }
  if (event.location?.trim()) {
    lines.push(foldIcsLine(`LOCATION:${escapeIcsText(event.location.trim())}`));
  }
  if (event.url?.trim()) {
    lines.push(foldIcsLine(`URL:${escapeIcsText(event.url.trim())}`));
  }
  // Attachment is the most broadly supported way to surface a map link.
  if (event.mapsUrl?.trim()) {
    lines.push(
      foldIcsLine(
        `ATTACH;FMTTYPE=text/html;X-LABEL=Map:${escapeIcsText(event.mapsUrl.trim())}`,
      ),
    );
  }

  lines.push("END:VEVENT");
  return lines;
}

export function buildPublicCalendar(input: BuildPublicCalendarInput): string {
  const timezone = input.timezone ?? PORTAL_TIMEZONE;
  const now = Date.now();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Arbor Live//Public Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldIcsLine(`X-WR-CALNAME:${escapeIcsText(input.calendarName)}`),
    foldIcsLine(`X-WR-TIMEZONE:${timezone}`),
    `REFRESH-INTERVAL;VALUE=DURATION:${input.refreshInterval ?? "PT1H"}`,
    `X-PUBLISHED-TTL:${input.refreshInterval ?? "PT1H"}`,
  ];

  if (input.storeLocation) {
    lines.push(
      foldIcsLine(
        `GEO:${input.storeLocation.lat};${input.storeLocation.lng}`,
      ),
    );
  }

  lines.push(...input.events.flatMap((event) => buildVeventLines(event, now)));
  lines.push("END:VCALENDAR");

  return `${lines.join("\r\n")}\r\n`;
}

/**
 * Compose the DESCRIPTION body: caption, then venue, then the event page. Each
 * calendar client renders this differently, so keep it plain text and ordered by
 * usefulness (the link is repeated as the URL property anyway).
 */
export function buildCalendarDescription(parts: {
  caption?: string;
  hostLabel?: string;
  venueAddress?: string;
  eventUrl?: string;
}): string | undefined {
  const lines: string[] = [];
  if (parts.caption?.trim()) lines.push(parts.caption.trim());
  if (parts.hostLabel?.trim()) lines.push(`Hosted by ${parts.hostLabel.trim()}`);
  if (parts.venueAddress?.trim()) lines.push(parts.venueAddress.trim());
  if (parts.eventUrl?.trim()) lines.push(`Details: ${parts.eventUrl.trim()}`);
  return lines.length > 0 ? lines.join("\n") : undefined;
}
