import { describe, expect, it } from "vitest";
import { buildCalendarDescription, buildPublicCalendar } from "./publicCalendar";

const baseEvent = {
  uid: "arbor-event-abc@arborlive.stanford.edu",
  title: "Spring Showcase",
  startAt: Date.UTC(2025, 4, 9, 2, 0, 0), // May 8, 7pm Pacific
  endAt: Date.UTC(2025, 4, 9, 5, 0, 0),
};

describe("buildPublicCalendar", () => {
  it("emits a subscribable PUBLISH calendar with a UTC show window", () => {
    const ics = buildPublicCalendar({ events: [baseEvent], calendarName: "Arbor Live Events" });
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics).toContain("X-WR-CALNAME:Arbor Live Events");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H");
    // UTC instants with a Z suffix: RFC 5545 requires a VTIMEZONE for every
    // TZID, and Outlook desktop misreads bare IANA TZIDs as floating time.
    expect(ics).toContain("DTSTART:20250509T020000Z");
    expect(ics).toContain("DTEND:20250509T050000Z");
    expect(ics).not.toContain("TZID=");
    expect(ics).not.toContain("VTIMEZONE");
    // No attendee/RSVP semantics — this is a feed, not an invite.
    expect(ics).not.toContain("ATTENDEE");
    expect(ics).not.toContain("ORGANIZER");
  });

  it("carries venue, event page, and map link when present", () => {
    const ics = buildPublicCalendar({
      events: [
        {
          ...baseEvent,
          location: "Memorial Church, 450 Jane Stanford Way",
          url: "https://arborlive.stanford.edu/events/abc",
          mapsUrl: "https://maps.google.com/?q=Memorial+Church",
          description: "Six acts.",
        },
      ],
      calendarName: "Arbor Live Events",
    });
    expect(ics).toContain("LOCATION:Memorial Church\\, 450 Jane Stanford Way");
    expect(ics).toContain("URL:https://arborlive.stanford.edu/events/abc");
    expect(ics).toContain("X-LABEL=Map:");
    // Unfold (strip CRLF + continuation space) before checking the map URL,
    // since long lines are split per RFC 5545.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("X-LABEL=Map:https://maps.google.com/?q=Memorial+Church");
    expect(ics).toContain("DESCRIPTION:Six acts.");
  });

  it("escapes commas, semicolons, and newlines so the feed never corrupts", () => {
    const ics = buildPublicCalendar({
      events: [
        {
          ...baseEvent,
          title: "Jazz; Live, Late\nSet",
          description: "Line one\nLine two",
        },
      ],
      calendarName: "Arbor Live Events",
    });
    expect(ics).toContain("SUMMARY:Jazz\\; Live\\, Late\\nSet");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two");
  });

  it("folds long lines at 75 octets for client compatibility", () => {
    const ics = buildPublicCalendar({
      events: [{ ...baseEvent, url: `https://arborlive.stanford.edu/events/${"x".repeat(120)}` }],
      calendarName: "Arbor Live Events",
    });
    const folded = ics.split("\r\n").filter((line) => line.startsWith(" "));
    expect(folded.length).toBeGreaterThan(0);
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
  });

  it("folds non-ASCII text by UTF-8 octets without splitting code points", () => {
    // Multi-byte characters must be counted by bytes, not JS code units: a
    // 74-char line of 3-byte CJK is 222 octets and must be folded.
    const ics = buildPublicCalendar({
      events: [{ ...baseEvent, title: "演出".repeat(60) }],
      calendarName: "Arbor Live Events",
    });
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    }
    // No lone surrogates: unfolding must round-trip the original text.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`SUMMARY:${"演出".repeat(60)}`);
  });
});

describe("buildCalendarDescription", () => {
  it("orders caption, host, address, then details link", () => {
    expect(
      buildCalendarDescription({
        caption: "Six acts.",
        hostLabel: "Arbor Live",
        venueAddress: "450 Jane Stanford Way",
        eventUrl: "https://arborlive.stanford.edu/events/abc",
      }),
    ).toBe(
      "Six acts.\nHosted by Arbor Live\n450 Jane Stanford Way\nDetails: https://arborlive.stanford.edu/events/abc",
    );
  });

  it("returns undefined when there is nothing to say", () => {
    expect(buildCalendarDescription({})).toBeUndefined();
  });
});
