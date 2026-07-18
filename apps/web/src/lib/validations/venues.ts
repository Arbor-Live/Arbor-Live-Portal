import { z } from "zod";

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

export function venueTypesForKind(kind: VenueKind): readonly string[] {
  return VENUE_TYPES_BY_KIND[kind];
}

const circuitSchema = z.object({
  label: z.string(),
  voltage: z.coerce.number().min(1).default(120),
  amperage: z.coerce.number().min(1).default(20),
});

const documentationLinkSchema = z.object({
  title: z.string(),
  url: z.string(),
});

const venueFileSchema = z.object({
  title: z.string(),
  r2Key: z.string(),
  fileName: z.string(),
  contentType: z.string(),
});

export const venueSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    nicknames: z.array(z.string()),
    parentId: z.string().optional(),
    kind: z.enum(VENUE_KINDS),
    venueType: z.string().trim().min(1, "Type is required"),
    capacity: z.union([z.coerce.number().int().min(1), z.nan(), z.literal("")]).optional(),
    address: z.string().optional(),
    googleMapsUrl: z.string().optional(),
    notesJson: z.string().optional(),
    circuits: z.array(circuitSchema),
    documentationLinks: z.array(documentationLinkSchema),
    files: z.array(venueFileSchema),
    contactName: z.string().optional(),
    contactEmail: z.string().optional(),
    contactPhone: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    const allowed = VENUE_TYPES_BY_KIND[values.kind] as readonly string[];
    if (!allowed.includes(values.venueType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid type for ${values.kind}`,
        path: ["venueType"],
      });
    }
    const maps = values.googleMapsUrl?.trim();
    if (maps && maps.length > 0) {
      try {
        new URL(maps);
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid URL",
          path: ["googleMapsUrl"],
        });
      }
    }
    const email = values.contactEmail?.trim();
    if (email && email.length > 0 && !z.string().email().safeParse(email).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid email",
        path: ["contactEmail"],
      });
    }
  });

export type VenueFormValues = z.infer<typeof venueSchema>;

export const venueQuickCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required"),
    nicknames: z.array(z.string()),
    parentId: z.string().optional(),
    kind: z.enum(VENUE_KINDS),
    venueType: z.string().trim().min(1, "Type is required"),
  })
  .superRefine((values, ctx) => {
    const allowed = VENUE_TYPES_BY_KIND[values.kind] as readonly string[];
    if (!allowed.includes(values.venueType)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid type for ${values.kind}`,
        path: ["venueType"],
      });
    }
  });

export type VenueQuickCreateValues = z.infer<typeof venueQuickCreateSchema>;

export const emptyVenueForm = (): VenueFormValues => ({
  name: "",
  nicknames: [],
  parentId: "",
  kind: "building",
  venueType: "Dorm",
  capacity: "",
  address: "",
  googleMapsUrl: "",
  notesJson: undefined,
  circuits: [],
  documentationLinks: [{ title: "", url: "" }],
  files: [],
  contactName: "",
  contactEmail: "",
  contactPhone: "",
});

/** True when Lexical JSON has no meaningful text content. */
export function isEmptyLexicalJson(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  // Any Lexical text node with non-whitespace content.
  return !/"text"\s*:\s*"(?:[^"\\]|\\.)*\S(?:[^"\\]|\\.)*"/.test(value);
}

export type VenueInheritableRow = {
  _id: string;
  name: string;
  path: string;
  parentId?: string;
  address?: string;
  googleMapsUrl?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  documentationLinks?: Array<{ title: string; url: string }>;
  files?: Array<{ title: string; r2Key: string; fileName: string; contentType: string }>;
};

export type VenueInheritedSource = {
  venueId: string;
  path: string;
  name: string;
};

export type ClientInheritedVenueFields = {
  address?: { value: string; source: VenueInheritedSource };
  googleMapsUrl?: { value: string; source: VenueInheritedSource };
  contact?: {
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    source: VenueInheritedSource;
  };
  documentationLinks: Array<{ title: string; url: string; source: VenueInheritedSource }>;
  files: Array<{
    title: string;
    r2Key: string;
    fileName: string;
    contentType: string;
    source: VenueInheritedSource;
  }>;
};

function venueHasContact(row: VenueInheritableRow) {
  return Boolean(
    row.contactName?.trim() || row.contactEmail?.trim() || row.contactPhone?.trim(),
  );
}

/** Resolve inheritable fields from parent → … → root (for venue editor). */
export function resolveClientInheritedVenueFields(
  venues: VenueInheritableRow[],
  parentId: string | undefined,
): ClientInheritedVenueFields {
  const byId = new Map(venues.map((venue) => [venue._id, venue]));
  const ancestors: VenueInheritableRow[] = [];
  let pointerId = parentId?.trim() || undefined;
  const seen = new Set<string>();
  while (pointerId) {
    if (seen.has(pointerId)) break;
    seen.add(pointerId);
    const current = byId.get(pointerId);
    if (!current) break;
    ancestors.push(current);
    pointerId = current.parentId;
  }

  const result: ClientInheritedVenueFields = {
    documentationLinks: [],
    files: [],
  };

  for (const ancestor of ancestors) {
    if (!result.address && ancestor.address?.trim()) {
      result.address = {
        value: ancestor.address,
        source: { venueId: ancestor._id, path: ancestor.path, name: ancestor.name },
      };
    }
    if (!result.googleMapsUrl && ancestor.googleMapsUrl?.trim()) {
      result.googleMapsUrl = {
        value: ancestor.googleMapsUrl,
        source: { venueId: ancestor._id, path: ancestor.path, name: ancestor.name },
      };
    }
    if (!result.contact && venueHasContact(ancestor)) {
      result.contact = {
        contactName: ancestor.contactName,
        contactEmail: ancestor.contactEmail,
        contactPhone: ancestor.contactPhone,
        source: { venueId: ancestor._id, path: ancestor.path, name: ancestor.name },
      };
    }
  }

  for (const ancestor of [...ancestors].reverse()) {
    const source = { venueId: ancestor._id, path: ancestor.path, name: ancestor.name };
    for (const link of ancestor.documentationLinks ?? []) {
      if (!link.url.trim()) continue;
      result.documentationLinks.push({ ...link, source });
    }
    for (const file of ancestor.files ?? []) {
      if (!file.r2Key.trim()) continue;
      result.files.push({ ...file, source });
    }
  }

  return result;
}

export function venueFormHasOwnContact(values: Pick<VenueFormValues, "contactName" | "contactEmail" | "contactPhone">) {
  return Boolean(
    values.contactName?.trim() || values.contactEmail?.trim() || values.contactPhone?.trim(),
  );
}

export function venueFormHasOwnAddress(values: Pick<VenueFormValues, "address">) {
  return Boolean(values.address?.trim());
}

export function venueFormHasOwnMapsUrl(values: Pick<VenueFormValues, "googleMapsUrl">) {
  return Boolean(values.googleMapsUrl?.trim());
}

export function venueFormHasOwnLinks(values: Pick<VenueFormValues, "documentationLinks">) {
  return values.documentationLinks.some((link) => link.url.trim().length > 0);
}

export function venueFormHasOwnFiles(values: Pick<VenueFormValues, "files">) {
  return values.files.some((file) => file.r2Key.trim().length > 0);
}