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
  performerHourlyRateUsd: z.coerce.number().min(0, "Rate must be non-negative"),
  publicWebsiteUrl: z.string().optional(),
  publicInstagramUrl: z.string().optional(),
  publicYoutubeUrl: z.string().optional(),
  publicSpotifyUrl: z.string().optional(),
  demoURL: z.string().optional(),
  publicListing: z.boolean().optional(),
  publicSlug: z.string().optional(),
  publicHeroImageUrl: z.string().optional(),
});

export type BandProfileFormValues = z.infer<typeof bandProfileSchema>;

export function parseGenresInput(value: string | undefined): string[] | undefined {
  const genres = (value ?? "")
    .split(",")
    .map((genre) => genre.trim())
    .filter(Boolean);
  return genres.length ? genres : undefined;
}

export function formatGenresInput(genres: string[] | undefined | null): string {
  return (genres ?? []).join(", ");
}

export const bandInviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["org_admin", "org_member"]),
  bandRole: z.string().optional(),
});

export type BandInviteFormValues = z.infer<typeof bandInviteSchema>;
