import { describe, expect, it } from "vitest";
import { SITE_URL } from "../email/constants";
import { buildBody, toNotificationPath } from "./inAppNotifications";

describe("toNotificationPath", () => {
  it("keeps the path and query of same-origin links", () => {
    expect(toNotificationPath(`${SITE_URL}/dashboard/inventory/damage?report=r1`)).toBe(
      "/dashboard/inventory/damage?report=r1",
    );
  });

  it("drops external links and junk", () => {
    expect(toNotificationPath("https://example.com/dashboard")).toBeUndefined();
    expect(toNotificationPath(undefined)).toBeUndefined();
    expect(toNotificationPath("  ")).toBeUndefined();
  });

  it("resolves a sign-in link to its redirect", () => {
    const url = `${SITE_URL}/sign-in?email=a%40b.c&redirect=${encodeURIComponent("/onboarding/artist")}`;
    expect(toNotificationPath(url)).toBe("/onboarding/artist");
    expect(toNotificationPath(`${SITE_URL}/sign-in?redirect=//evil.com`)).toBeUndefined();
  });
});

describe("buildBody", () => {
  it("shows an act's soundcheck/set window rather than the whole event", () => {
    expect(
      buildBody({
        dateRangeLabel: "Sat, Apr 12 • 6:00 PM – 11:00 PM",
        timeRangeLabel: "Sat, Apr 12 • 4:00 PM – 4:45 PM",
        venueName: "Arbor Stage",
      }),
    ).toBe("Sat, Apr 12 • 4:00 PM – 4:45 PM · Arbor Stage");
  });

  it("falls back to the event's dates", () => {
    expect(buildBody({ dateRangeLabel: "Sat, Apr 12", venueName: "Arbor Stage" })).toBe(
      "Sat, Apr 12 · Arbor Stage",
    );
  });
});
