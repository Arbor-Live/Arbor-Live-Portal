import { describe, expect, it } from "vitest";
import {
  buildEventCalendarProviderLinks,
  buildGoogleCalendarEventUrl,
  buildSingleEventIcs,
  eventCalendarIcsPath,
  formatCalendarUtc,
} from "./event-calendar";

const event = {
  eventId: "abc123",
  title: "Musician Jam",
  startAt: Date.UTC(2026, 8, 30, 3, 0, 0), // Sep 29, 8pm Pacific
  endAt: Date.UTC(2026, 8, 30, 6, 0, 0),
  location: "The Arbor, Stanford, CA",
  description: "Weekly jam.",
  url: "https://arborlive.stanford.edu/events/abc123",
};

describe("event calendar helpers", () => {
  it("builds the per-event ICS path", () => {
    expect(eventCalendarIcsPath("abc123")).toBe("/events/abc123/calendar.ics");
  });

  it("formats UTC instants the way Google Calendar templates expect", () => {
    expect(formatCalendarUtc(event.startAt)).toBe("20260930T030000Z");
    expect(formatCalendarUtc(event.endAt)).toBe("20260930T060000Z");
  });

  it("opens Google's add-event template with title, window, and venue", () => {
    const url = buildGoogleCalendarEventUrl(event);
    expect(url.startsWith("https://calendar.google.com/calendar/render?")).toBe(true);
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("text=Musician+Jam");
    expect(url).toContain("dates=20260930T030000Z%2F20260930T060000Z");
    expect(url).toContain("location=The+Arbor%2C+Stanford%2C+CA");
    expect(url).toContain("details=Weekly+jam.");
  });

  it("hands Apple a webcal ICS and Outlook the https ICS", () => {
    const icsUrl = "https://arborlive.stanford.edu/events/abc123/calendar.ics";
    const links = buildEventCalendarProviderLinks(event, icsUrl);
    expect(links.apple).toBe("webcal://arborlive.stanford.edu/events/abc123/calendar.ics");
    expect(links.outlook).toBe(icsUrl);
    expect(links.google).toContain("action=TEMPLATE");
  });

  it("emits a single-event PUBLISH calendar with the feed UID", () => {
    const ics = buildSingleEventIcs(event);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("UID:arbor-event-abc123@arborlive.stanford.edu");
    expect(ics).toContain("DTSTART:20260930T030000Z");
    expect(ics).toContain("DTEND:20260930T060000Z");
    expect(ics).toContain("SUMMARY:Musician Jam");
    expect(ics).toContain("LOCATION:The Arbor\\, Stanford\\, CA");
    expect(ics).toContain("URL:https://arborlive.stanford.edu/events/abc123");
    expect(ics).not.toContain("ATTENDEE");
    expect(ics).not.toContain("ORGANIZER");
  });

  it("escapes commas and semicolons in ICS text", () => {
    const ics = buildSingleEventIcs({
      ...event,
      title: "Jazz; Live, Late",
    });
    expect(ics).toContain("SUMMARY:Jazz\\; Live\\, Late");
  });
});
