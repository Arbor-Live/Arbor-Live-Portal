import { describe, expect, it } from "vitest";
import { renderArtistNeedInquiryEmail } from "../src/render";
import type { ArtistNeedInquiryEmailProps } from "../src/types";

const props = {
  artistName: "The Redwoods",
  eventTitle: "Open Need Jazz Night",
  dateRangeLabel: "Friday, Oct 9, 2026 • 6:00 PM – 10:00 PM",
  venueName: "Memorial Auditorium",
  artistTypeLabel: "Live band",
  genres: "indie rock",
  message: "Indie rock set, one hour.",
  reviewUrl: "http://localhost:3000/dashboard/events/abc/artists",
} satisfies ArtistNeedInquiryEmailProps;

describe("renderArtistNeedInquiryEmail", () => {
  it("names the artist, the event, and their note", async () => {
    const html = await renderArtistNeedInquiryEmail(props);
    expect(html).toContain("The Redwoods");
    expect(html).toContain("Open Need Jazz Night");
    expect(html).toContain("Indie rock set, one hour.");
  });

  it("links straight to the event Artists tab", async () => {
    const html = await renderArtistNeedInquiryEmail(props);
    expect(html).toContain("http://localhost:3000/dashboard/events/abc/artists");
    expect(html).toContain("Live band");
    expect(html).toContain("indie rock");
  });

  it("omits the optional venue and note when absent", async () => {
    const html = await renderArtistNeedInquiryEmail({
      ...props,
      venueName: undefined,
      genres: undefined,
      message: undefined,
    });
    expect(html).toContain("Open Need Jazz Night");
    expect(html).not.toContain("Memorial Auditorium");
    expect(html).not.toContain("Indie rock set, one hour.");
  });
});
