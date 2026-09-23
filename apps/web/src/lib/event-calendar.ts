/**
 * Per-show calendar hand-off: Google's "add event" template, plus a
 * downloadable/subscribable ICS for Apple and Outlook.
 *
 * Distinct from `calendar-links.ts`, which subscribes to the *feed* of every
 * public show. These helpers add one event.
 */

export function eventCalendarIcsPath(eventId: string): string {
  return `/events/${eventId}/calendar.ics`;
}

export function formatCalendarUtc(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

export type EventCalendarInput = {
  eventId: string;
  title: string;
  startAt: number;
  endAt: number;
  location?: string;
  description?: string;
  url?: string;
};

export function buildGoogleCalendarEventUrl(event: EventCalendarInput): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatCalendarUtc(event.startAt)}/${formatCalendarUtc(event.endAt)}`,
  });
  if (event.description?.trim()) params.set("details", event.description.trim());
  if (event.location?.trim()) params.set("location", event.location.trim());
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export type EventCalendarProviderLinks = {
  google: string;
  apple: string;
  outlook: string;
};

/** Provider URLs for a single-event ICS hosted on our domain. */
export function buildEventCalendarProviderLinks(
  event: EventCalendarInput,
  icsAbsoluteUrl: string,
): EventCalendarProviderLinks {
  const webcal = icsAbsoluteUrl.replace(/^https?:\/\//, "webcal://");
  return {
    google: buildGoogleCalendarEventUrl(event),
    apple: webcal,
    outlook: icsAbsoluteUrl,
  };
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function foldIcsLine(line: string) {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  let budget = 75;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > budget) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
      budget = 74;
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current) chunks.push(current);

  return chunks.map((chunk, index) => (index === 0 ? chunk : ` ${chunk}`)).join("\r\n");
}

/**
 * One-event PUBLISH calendar. UID matches the public feed so a student who
 * later subscribes to all shows does not get a duplicate of this one.
 */
export function buildSingleEventIcs(event: EventCalendarInput): string {
  const now = Date.now();
  const uid = `arbor-event-${event.eventId}@arborlive.stanford.edu`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Arbor Live//Event//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    foldIcsLine(`X-WR-CALNAME:${escapeIcsText(event.title)}`),
    "BEGIN:VEVENT",
    foldIcsLine(`UID:${escapeIcsText(uid)}`),
    foldIcsLine(`DTSTAMP:${formatCalendarUtc(now)}`),
    foldIcsLine(`DTSTART:${formatCalendarUtc(event.startAt)}`),
    foldIcsLine(`DTEND:${formatCalendarUtc(event.endAt)}`),
    foldIcsLine(`SUMMARY:${escapeIcsText(event.title)}`),
    "TRANSP:OPAQUE",
    "STATUS:CONFIRMED",
  ];

  if (event.description?.trim()) {
    lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(event.description.trim())}`));
  }
  if (event.location?.trim()) {
    lines.push(foldIcsLine(`LOCATION:${escapeIcsText(event.location.trim())}`));
  }
  if (event.url?.trim()) {
    lines.push(foldIcsLine(`URL:${escapeIcsText(event.url.trim())}`));
  }

  lines.push("END:VEVENT", "END:VCALENDAR");
  return `${lines.join("\r\n")}\r\n`;
}
