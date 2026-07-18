export const VENUE_KINDS = ["building", "indoor", "outdoor"] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];

export const VENUE_KIND_LABELS = {
  building: "Building",
  indoor: "Indoor",
  outdoor: "Outdoor",
} as const satisfies Record<VenueKind, string>;

export function formatVenueKindLabel(kind: VenueKind): string {
  return VENUE_KIND_LABELS[kind];
}

export const VENUE_TYPES_BY_KIND = {
  building: ["Dorm", "Academic", "Leisure Space"],
  indoor: ["Classroom", "Theater", "Conference Room", "Common Space", "Other"],
  outdoor: ["Backyard", "Park", "Fountain", "Common Space", "Other"],
} as const satisfies Record<VenueKind, readonly string[]>;

export type VenueTypeForKind<K extends VenueKind> = (typeof VENUE_TYPES_BY_KIND)[K][number];

export function isVenueKind(value: string): value is VenueKind {
  return (VENUE_KINDS as readonly string[]).includes(value);
}

export function venueTypesForKind(kind: VenueKind): readonly string[] {
  return VENUE_TYPES_BY_KIND[kind];
}

export function isValidVenueType(kind: VenueKind, venueType: string): boolean {
  return (VENUE_TYPES_BY_KIND[kind] as readonly string[]).includes(venueType);
}

export function assertValidVenueType(kind: VenueKind, venueType: string): void {
  if (!isValidVenueType(kind, venueType)) {
    throw new Error(`Invalid venue type "${venueType}" for kind "${kind}".`);
  }
}

export const DEFAULT_CIRCUIT_VOLTAGE = 120;
export const DEFAULT_CIRCUIT_AMPERAGE = 20;
