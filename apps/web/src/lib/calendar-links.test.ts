import { describe, expect, it } from "vitest";
import { buildCalendarProviderLinks } from "./calendar-links";

const FEED = "https://arborlive.stanford.edu/events/calendar.ics";

describe("buildCalendarProviderLinks", () => {
  const links = buildCalendarProviderLinks(FEED);

  it("opens Google's add-from-URL flow with the encoded feed", () => {
    expect(links.google).toBe(
      `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(FEED)}`,
    );
  });

  it("uses webcal for Apple, since browsers cannot subscribe directly", () => {
    expect(links.apple).toBe(
      "webcal://arborlive.stanford.edu/events/calendar.ics",
    );
  });

  it("targets Microsoft 365 (Stanford) for Outlook with an https URL", () => {
    expect(links.outlook).toContain("https://outlook.office.com/");
    // Outlook web rejects webcal://; the feed must stay https.
    expect(links.outlook).toContain(encodeURIComponent(FEED));
    expect(links.outlook).not.toContain("webcal");
  });

  it("names the calendar so Outlook's list is readable", () => {
    expect(links.outlook).toContain("name=Arbor%20Live%20Events");
  });

  it("encodes a feed URL with its own query string safely", () => {
    const withQuery = "https://example.com/cal.ics?token=abc&x=1";
    const encoded = buildCalendarProviderLinks(withQuery);
    // The ampersand must be escaped so it does not split the outer query.
    expect(encoded.google).toContain("%26");
    expect(encoded.outlook).toContain("%26");
  });
});
