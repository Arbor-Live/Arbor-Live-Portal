import { describe, expect, it } from "vitest";
import { matchesNotificationPath } from "./notification-paths";

describe("matchesNotificationPath", () => {
  it("matches the exact page", () => {
    expect(matchesNotificationPath("/dashboard/events/abc", "/dashboard/events/abc", "")).toBe(true);
    expect(matchesNotificationPath("/dashboard/events/abc", "/dashboard/events/abc/", "")).toBe(true);
  });

  it("covers child pages of a specific record", () => {
    expect(
      matchesNotificationPath("/dashboard/events/abc", "/dashboard/events/abc/schedule", ""),
    ).toBe(true);
    expect(matchesNotificationPath("/dashboard/events/abc", "/dashboard/events/abcd", "")).toBe(
      false,
    );
  });

  it("never lets a shallow path swallow its children", () => {
    expect(matchesNotificationPath("/dashboard", "/dashboard/events", "")).toBe(false);
    expect(matchesNotificationPath("/onboarding", "/onboarding/artist", "")).toBe(false);
  });

  it("requires the notification's query params", () => {
    const path = "/dashboard/inventory/damage?report=r1";
    expect(matchesNotificationPath(path, "/dashboard/inventory/damage", "")).toBe(false);
    expect(matchesNotificationPath(path, "/dashboard/inventory/damage", "?report=r2")).toBe(false);
    expect(
      matchesNotificationPath(path, "/dashboard/inventory/damage", "?tab=open&report=r1"),
    ).toBe(true);
  });
});
