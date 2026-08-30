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

export const bandProfileSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  bio: z.string().optional(),
  oneLiner: z.string().optional(),
  genres: z.string().optional(),
  demoURL: z.string().optional(),
  mainContactName: z.string().optional(),
  mainContactEmail: z.string().optional(),
  mainContactPhone: z.string().optional(),
  performerHourlyRateUsd: z.coerce.number().min(0, "Rate must be non-negative"),
  publicWebsiteUrl: z.string().optional(),
  publicInstagramUrl: z.string().optional(),
  publicYoutubeUrl: z.string().optional(),
  publicSpotifyUrl: z.string().optional(),
  publicListing: z.boolean().optional(),
  publicSlug: z.string().optional(),
  publicHeroImageUrl: z.string().optional(),
});

export type BandProfileFormValues = z.infer<typeof bandProfileSchema>;

export const bandInviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["org_admin", "org_member"]),
  bandRole: z.string().optional(),
});

export type BandInviteFormValues = z.infer<typeof bandInviteSchema>;

export const eventBandPayoutFieldsSchema = z.object({
  pricingMode: z.enum(["per_member_hourly", "fixed_total"]),
  ratePerMemberPerHourUsd: z.coerce.number().min(0, "Rate must be non-negative"),
  performanceHours: z.coerce.number().min(0, "Performance length must be non-negative"),
  memberCount: z.coerce
    .number()
    .int("Member count must be a whole number")
    .min(1, "Member count must be at least 1"),
  fixedTotalUsd: z.coerce.number().min(0, "Total must be non-negative"),
});

export type EventBandPayoutFieldsFormValues = z.infer<typeof eventBandPayoutFieldsSchema>;

export const eventBandOnboardingInviteSchema = eventBandPayoutFieldsSchema.extend({
  email: z.string().email("Enter a valid email"),
  artistName: z.string().trim().min(1, "Enter an artist or band name"),
  role: z.enum(["headliner", "support", "other"]),
});

export type EventBandOnboardingInviteFormValues = z.infer<typeof eventBandOnboardingInviteSchema>;
