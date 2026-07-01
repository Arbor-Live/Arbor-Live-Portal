export type IcsEventInput = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
};

export type ScheduleIcsInput = {
  timezone: string;
  organizerEmail: string;
  attendeeEmail: string;
  events: IcsEventInput[];
};

/** @deprecated Use ScheduleIcsInput with a single event instead. */
export type EventIcsInput = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  organizerEmail: string;
  attendeeEmails: string[];
};

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

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

function formatIcsUtcDateTime(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

function formatIcsLocalDateTime(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}${get("month")}${get("day")}T${hour}${get("minute")}${get("second")}`;
}

function buildVeventLines(event: IcsEventInput, input: ScheduleIcsInput, now: Date) {
  const lines = [
    "BEGIN:VEVENT",
    foldIcsLine(`UID:${escapeIcsText(event.uid)}`),
    foldIcsLine(`DTSTAMP:${formatIcsUtcDateTime(now)}`),
    foldIcsLine(
      `DTSTART;TZID=${input.timezone}:${formatIcsLocalDateTime(event.startAt, input.timezone)}`,
    ),
    foldIcsLine(
      `DTEND;TZID=${input.timezone}:${formatIcsLocalDateTime(event.endAt, input.timezone)}`,
    ),
    foldIcsLine(`SUMMARY:${escapeIcsText(event.title)}`),
    foldIcsLine(
      `ORGANIZER;CN=Arbor Live:mailto:${escapeIcsText(input.organizerEmail)}`,
    ),
    foldIcsLine(
      `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${escapeIcsText(input.attendeeEmail)}`,
    ),
  ];

  if (event.description?.trim()) {
    lines.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(event.description.trim())}`));
  }
  if (event.location?.trim()) {
    lines.push(foldIcsLine(`LOCATION:${escapeIcsText(event.location.trim())}`));
  }

  lines.push("END:VEVENT");
  return lines;
}

export function buildScheduleIcs(input: ScheduleIcsInput): string {
  if (input.events.length === 0) {
    throw new Error("At least one calendar event is required.");
  }

  const now = new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Arbor Live//Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    ...input.events.flatMap((event) => buildVeventLines(event, input, now)),
    "END:VCALENDAR",
  ];

  return `${lines.join("\r\n")}\r\n`;
}

export function buildEventIcs(input: EventIcsInput): string {
  const attendeeEmail = input.attendeeEmails[0];
  if (!attendeeEmail) {
    throw new Error("At least one attendee email is required.");
  }

  return buildScheduleIcs({
    timezone: input.timezone,
    organizerEmail: input.organizerEmail,
    attendeeEmail,
    events: [
      {
        uid: input.uid,
        title: input.title,
        description: input.description,
        location: input.location,
        startAt: input.startAt,
        endAt: input.endAt,
      },
    ],
  });
}
