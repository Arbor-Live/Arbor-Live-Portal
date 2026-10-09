import { describe, expect, it } from "vitest";
import { routeRedirects } from "./route-redirects";

describe("routeRedirects", () => {
  it("permanently redirects old financial-hub URLs to Ops Center", () => {
    expect(routeRedirects).toContainEqual({
      source: "/dashboard/financial-hub",
      destination: "/dashboard/ops-center",
      permanent: true,
    });
    expect(routeRedirects).toContainEqual({
      source: "/dashboard/financial-hub/:path*",
      destination: "/dashboard/ops-center/:path*",
      permanent: true,
    });
  });

  it("keeps the band-payouts rename ahead of the financial-hub catch-all", () => {
    const specific = routeRedirects.findIndex(
      (redirect) => redirect.source === "/dashboard/financial-hub/band-payouts",
    );
    const catchAll = routeRedirects.findIndex(
      (redirect) => redirect.source === "/dashboard/financial-hub/:path*",
    );
    expect(specific).toBeGreaterThanOrEqual(0);
    expect(catchAll).toBeGreaterThanOrEqual(0);
    expect(specific).toBeLessThan(catchAll);
    expect(routeRedirects[specific]?.destination).toBe("/dashboard/ops-center/artist-payouts");
  });

  it("points the old booking-requests routes at Ops Center in one hop", () => {
    expect(routeRedirects).toContainEqual({
      source: "/dashboard/events/requests",
      destination: "/dashboard/ops-center/requests",
      permanent: true,
    });
    expect(routeRedirects).toContainEqual({
      source: "/dashboard/events/requests/:path*",
      destination: "/dashboard/ops-center/requests/:path*",
      permanent: true,
    });
  });
});
