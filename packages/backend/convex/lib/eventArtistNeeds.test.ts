import { describe, expect, it } from "vitest";
import type { Doc, Id } from "../_generated/dataModel";
import { artistTypeMatchesNeed, buildArtistOpportunityRow } from "./eventArtistNeeds";
import { latestWebsiteVisibleDesign } from "./marketingDesigns";

const EVENT_ID = "ke1" as Id<"events">;
const SITE_URL = "https://arborlive.stanford.edu";

function need(partial: Partial<Doc<"eventArtistNeeds">> = {}): Doc<"eventArtistNeeds"> {
  return {
    _id: "kn1" as Id<"eventArtistNeeds">,
    _creationTime: 0,
    eventId: EVENT_ID,
    artistType: "band",
    genres: "indie",
    label: "Headliner",
    status: "open",
    setStartsAt: 1_000,
    setEndsAt: 2_000,
    createdByUserId: "user",
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as Doc<"eventArtistNeeds">;
}

function event(partial: Partial<Doc<"events">> = {}): Doc<"events"> {
  return {
    _id: EVENT_ID,
    _creationTime: 0,
    title: "Spring Show",
    startAt: 1_000,
    endAt: 2_000,
    timezone: "America/Los_Angeles",
    venueName: "Memorial Church",
    status: "ready",
    visibility: "public",
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as Doc<"events">;
}

function design(partial: Partial<Doc<"eventMarketingDesigns">> = {}) {
  return {
    _id: "kd1" as Id<"eventMarketingDesigns">,
    eventId: EVENT_ID,
    status: "ready" as const,
    caption: "  A night of jazz.  ",
    imageUrl: "r2:poster-key",
    createdByUserId: "user",
    createdAt: 0,
    updatedAt: 0,
    ...partial,
  } as Doc<"eventMarketingDesigns">;
}

describe("latestWebsiteVisibleDesign", () => {
  it("ignores drafts and picks the newest visible design", () => {
    expect(latestWebsiteVisibleDesign([design({ status: "draft" })])).toBeNull();
    const older = design({ _id: "kd-old" as Id<"eventMarketingDesigns">, updatedAt: 1 });
    const newer = design({ _id: "kd-new" as Id<"eventMarketingDesigns">, updatedAt: 2 });
    expect(latestWebsiteVisibleDesign([newer, older])?._id).toBe(newer._id);
  });
});

describe("buildArtistOpportunityRow", () => {
  it("takes the description and poster from the website-visible design", () => {
    const row = buildArtistOpportunityRow({
      need: need(),
      event: event(),
      design: design(),
      posterUrl: "https://cdn.example/poster.jpg",
      siteUrl: SITE_URL,
      alreadyInquired: false,
    });
    expect(row.description).toBe("A night of jazz.");
    expect(row.posterUrl).toBe("https://cdn.example/poster.jpg");
    expect(row.setStartsAt).toBe(1_000);
    expect(row.setEndsAt).toBe(2_000);
  });

  it("drops the poster when the design has no image", () => {
    const row = buildArtistOpportunityRow({
      need: need(),
      event: event(),
      design: design({ imageUrl: undefined }),
      posterUrl: "https://cdn.example/poster.jpg",
      siteUrl: SITE_URL,
      alreadyInquired: false,
    });
    expect(row.posterUrl).toBeUndefined();
  });

  it("has no description or poster when there is no visible design", () => {
    const row = buildArtistOpportunityRow({
      need: need(),
      event: event(),
      design: null,
      posterUrl: undefined,
      siteUrl: SITE_URL,
      alreadyInquired: false,
    });
    expect(row.description).toBeUndefined();
    expect(row.posterUrl).toBeUndefined();
  });

  it("links the public page only for a public, listable event", () => {
    const link = (partial: Partial<Doc<"events">>) =>
      buildArtistOpportunityRow({
        need: need(),
        event: event(partial),
        design: null,
        siteUrl: SITE_URL,
        alreadyInquired: false,
      }).publicEventUrl;

    expect(link({})).toBe(`${SITE_URL}/events/${EVENT_ID}`);
    expect(link({ status: "logistics" })).toBe(`${SITE_URL}/events/${EVENT_ID}`);
    expect(link({ status: "tentative" })).toBeUndefined();
    expect(link({ status: "cancelled" })).toBeUndefined();
    expect(link({ visibility: "internal" })).toBeUndefined();
    expect(link({ visibility: "informational" })).toBeUndefined();
  });

  it("carries the inquiry state through", () => {
    const row = buildArtistOpportunityRow({
      need: need(),
      event: event(),
      design: null,
      siteUrl: SITE_URL,
      alreadyInquired: true,
    });
    expect(row.alreadyInquired).toBe(true);
  });
});

describe("artistTypeMatchesNeed", () => {
  it("offers a singer-songwriter position only to singer-songwriters", () => {
    expect(artistTypeMatchesNeed("singer_songwriter", "singer_songwriter")).toBe(true);
    expect(artistTypeMatchesNeed("singer_songwriter", "band")).toBe(false);
    expect(artistTypeMatchesNeed("singer_songwriter", "dj")).toBe(false);
  });
});
