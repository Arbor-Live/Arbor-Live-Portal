import { z } from "zod";

export const bandPayeePayoutMethodSchema = z.enum(["pickup", "delivery"]);

export const bandPayeeSchema = z.object({
  designatedPayeeUserId: z.string().optional(),
  designatedPayeeName: z.string().optional(),
  designatedPayeeEmail: z.string().optional(),
  designatedPayeeMailingAddress: z.string().optional(),
  designatedPayeePayoutMethod: bandPayeePayoutMethodSchema.optional(),
});

export type BandPayeeFormValues = z.infer<typeof bandPayeeSchema>;

export function slugifyBandName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export function bandPublicListingRefinement(
  values: { publicListing?: boolean; publicSlug?: string },
  ctx: z.RefinementCtx,
) {
  if (!values.publicListing) return;

  const slug = values.publicSlug?.trim() ?? "";
  if (!slug) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Add a public URL slug to list on the artists page.",
      path: ["publicSlug"],
    });
    return;
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Use lowercase letters, numbers, and single dashes only.",
      path: ["publicSlug"],
    });
  }
}

export function ensureBandPublicSlug<T extends { publicListing?: boolean; publicSlug?: string; displayName: string }>(
  values: T,
): T {
  if (!values.publicListing || values.publicSlug?.trim()) {
    return values;
  }
  const generated = slugifyBandName(values.displayName);
  if (!generated) return values;
  return { ...values, publicSlug: generated };
}

export const bandProfileSchema = z
  .object({
    displayName: z.string().min(1, "Display name is required"),
    bio: z.string().optional(),
    oneLiner: z.string().optional(),
    genres: z.string().optional(),
    organizationType: z.string().optional(),
    demoURL: z.string().optional(),
    mainContactName: z.string().optional(),
    mainContactEmail: z.string().optional(),
    mainContactPhone: z.string().optional(),
    performerHourlyRateUsd: z.coerce.number().min(0, "Rate must be non-negative"),
    artistLinks: z
      .array(z.object({ label: z.string(), url: z.string(), icon: z.string().optional() }))
      .optional(),
    publicListing: z.boolean().optional(),
    publicSlug: z.string().optional(),
    publicHeroImageUrl: z.string().optional(),
  })
  .superRefine(bandPublicListingRefinement);

export type BandProfileFormValues = z.infer<typeof bandProfileSchema>;

export const bandInviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["org_admin", "org_member"]),
  bandRole: z.string().optional(),
});

export type BandInviteFormValues = z.infer<typeof bandInviteSchema>;

/** A booking's price as typed on the Lineup: people × hours × rate, or a fixed total. */
export const bookingPriceFieldsSchema = z.object({
  pricingMode: z.enum(["per_member_hourly", "fixed_total"]),
  memberCount: z.coerce
    .number()
    .int("People must be a whole number")
    .min(1, "At least one person"),
  performanceHours: z.coerce.number().min(0, "Hours can't be negative"),
  ratePerMemberPerHourUsd: z.coerce.number().min(0, "Rate can't be negative"),
  fixedTotalUsd: z.coerce.number().min(0, "Total can't be negative"),
});

export type BookingPriceFieldsFormValues = z.infer<typeof bookingPriceFieldsSchema>;

export const eventBandOnboardingInviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  artistName: z.string().trim().min(1, "Enter an artist name"),
  role: z.enum(["headliner", "support", "other"]),
});

export type EventBandOnboardingInviteFormValues = z.infer<typeof eventBandOnboardingInviteSchema>;
