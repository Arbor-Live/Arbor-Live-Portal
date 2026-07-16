import { z } from "zod";

export const VENUE_KINDS = ["building", "indoor", "outdoor"] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];

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
  notesJson: "",
  circuits: [],
  documentationLinks: [{ title: "", url: "" }],
  files: [],
  contactName: "",
  contactEmail: "",
  contactPhone: "",
});
