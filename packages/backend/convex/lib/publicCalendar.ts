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

/** RFC 5545 folds lines at 75 octets; continuation lines start with a space. */
function foldIcsLine(line: string) {
  if (line.length <= 75) return line;
  const chunks = [line.slice(0, 75)];
  let index = 75;
  while (index < line.length) {
    chunks.push(` ${line.slice(index, index + 74)}`);
    index += 74;
  }
  return chunks.join("\r\n");
}

function formatIcsUtcDateTime(ms: number) {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

/** Wall-clock in the portal timezone, paired with a TZID reference. */
function formatIcsLocalDateTime(ms: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}${get("month")}${get("day")}T${hour}${get("minute")}${get("second")}`;
}

function buildVeventLines(
  event: PublicCalendarEvent,
  timezone: string,
  now: number,
) {
  const lines = [
    "BEGIN:VEVENT",
    foldIcsLine(`UID:${escapeIcsText(event.uid)}`),
    foldIcsLine(`DTSTAMP:${formatIcsUtcDateTime(now)}`),
    foldIcsLine(
      `DTSTART;TZID=${timezone}:${formatIcsLocalDateTime(event.startAt, timezone)}`,
    ),
    foldIcsLine(
      `DTEND;TZID=${timezone}:${formatIcsLocalDateTime(event.endAt, timezone)}`,
    ),
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

  lines.push(...input.events.flatMap((event) => buildVeventLines(event, timezone, now)));
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
