export type RouteRedirect = {
  source: string;
  destination: string;
  permanent: boolean;
};

/**
 * Permanent redirects for renamed routes, kept out of `next.config.ts` so the
 * mapping is unit-testable. Order matters: Next.js matches the first rule, so
 * specific sources go before their catch-all.
 */
export const routeRedirects: RouteRedirect[] = [
  { source: "/public/packages", destination: "/packages", permanent: true },
  { source: "/public/packages/:path*", destination: "/packages/:path*", permanent: true },
  { source: "/public/types", destination: "/types", permanent: true },
  { source: "/public/types/:path*", destination: "/types/:path*", permanent: true },
  { source: "/public/request", destination: "/request", permanent: true },
  { source: "/public/request/:path*", destination: "/request/:path*", permanent: true },
  { source: "/public/open-mic", destination: "/open-mic", permanent: true },
  { source: "/public/event/:token", destination: "/event/:token", permanent: true },
  { source: "/public/quote/:token", destination: "/quote/:token", permanent: true },
  // Artist route renames (old band URLs)
  {
    source: "/dashboard/bands-and-performers",
    destination: "/dashboard/artists",
    permanent: true,
  },
  {
    source: "/dashboard/bands-and-performers/:path*",
    destination: "/dashboard/artists/:path*",
    permanent: true,
  },
  // Ops Center rename (was /dashboard/financial-hub).
  {
    source: "/dashboard/financial-hub/band-payouts",
    destination: "/dashboard/ops-center/artist-payouts",
    permanent: true,
  },
  {
    source: "/dashboard/financial-hub",
    destination: "/dashboard/ops-center",
    permanent: true,
  },
  {
    source: "/dashboard/financial-hub/:path*",
    destination: "/dashboard/ops-center/:path*",
    permanent: true,
  },
  {
    source: "/dashboard/users/band-applications",
    destination: "/dashboard/users/artist-applications",
    permanent: true,
  },
  { source: "/onboarding/band", destination: "/onboarding/artist", permanent: true },
  {
    source: "/dashboard/events/requests",
    destination: "/dashboard/ops-center/requests",
    permanent: true,
  },
  {
    source: "/dashboard/events/requests/:path*",
    destination: "/dashboard/ops-center/requests/:path*",
    permanent: true,
  },
  // Event workspace tabs that merged in the redesign.
  {
    source: "/dashboard/events/:id/expenses",
    destination: "/dashboard/events/:id/billing",
    permanent: true,
  },
  {
    source: "/dashboard/events/:id/marketing",
    destination: "/dashboard/events/:id/promo",
    permanent: true,
  },
  {
    source: "/dashboard/events/:id/media",
    destination: "/dashboard/events/:id/promo",
    permanent: true,
  },
  {
    source: "/dashboard/events/:id/artifacts",
    destination: "/dashboard/events/:id",
    permanent: true,
  },
];
