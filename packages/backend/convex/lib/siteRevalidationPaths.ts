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

export function publicEventsRevalidatePaths(eventId?: string) {
  const paths = ["/", "/events"];
  if (eventId) paths.push(`/events/${eventId}`);
  return paths;
}

export function inventoryPackageRevalidatePaths(packageId?: string) {
  const paths = [
    "/packages",
    "/packages/lighting",
    "/packages/sound",
    "/packages/environmental",
    "/packages/staging",
    "/packages/misc",
  ];
  if (packageId) {
    paths.push(`/packages/view/${packageId}`);
  }
  return paths;
}

export function inventoryTypeRevalidatePaths() {
  return [
    "/types",
    "/types/lighting",
    "/types/sound",
    "/types/environmental",
    "/types/staging",
    "/types/misc",
  ];
}
