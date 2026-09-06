export const PUBLIC_PACKAGE_BUCKETS = [
  "lighting",
  "sound",
  "backline",
  "environmental",
  "staging",
  "misc",
] as const;

export type PublicPackageBucket = (typeof PUBLIC_PACKAGE_BUCKETS)[number];

export const SITE_REVALIDATE_SECONDS = 3600;

export const siteRevalidateTags = {
  marketing: "site-marketing",
  inventoryPackages: "site-inventory-packages",
  inventoryTypes: "site-inventory-types",
  home: "site-home",
} as const;

export function marketingRevalidatePaths(slug?: string) {
  const paths = ["/", "/work"];
  if (slug) paths.push(`/work/${slug}`);
  return paths;
}

export function inventoryPackageRevalidatePaths(packageId?: string) {
  const paths = [
    "/packages",
    ...PUBLIC_PACKAGE_BUCKETS.map((bucket) => `/packages/${bucket}`),
  ];
  if (packageId) {
    paths.push(`/packages/view/${packageId}`);
  }
  return paths;
}

export function publicEventsRevalidatePaths(eventId?: string) {
  const paths = ["/", "/events"];
  if (eventId) paths.push(`/events/${eventId}`);
  return paths;
}

export function inventoryTypeRevalidatePaths() {
  return ["/types", ...PUBLIC_PACKAGE_BUCKETS.map((bucket) => `/types/${bucket}`)];
}
