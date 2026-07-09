export const SITE_REVALIDATE_SECONDS = 3600;

export const PUBLIC_PACKAGE_BUCKETS = [
  "lighting",
  "sound",
  "environmental",
  "staging",
  "misc",
] as const;

export type PublicPackageBucket = (typeof PUBLIC_PACKAGE_BUCKETS)[number];

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
    "/public/packages",
    "/public/packages/lighting",
    "/public/packages/sound",
    "/public/packages/environmental",
    "/public/packages/staging",
    "/public/packages/misc",
  ];
  if (packageId) {
    paths.push(`/public/packages/view/${packageId}`);
  }
  return paths;
}

export function publicEventsRevalidatePaths(eventId?: string) {
  const paths = ["/", "/events"];
  if (eventId) paths.push(`/events/${eventId}`);
  return paths;
}

export function inventoryTypeRevalidatePaths() {
  return [
    "/public/types",
    "/public/types/lighting",
    "/public/types/sound",
    "/public/types/environmental",
    "/public/types/staging",
    "/public/types/misc",
  ];
}
