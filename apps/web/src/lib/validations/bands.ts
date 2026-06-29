import { z } from "zod";

export const bandProfileSchema = z.object({
  displayName: z.string().min(1, "Display name is required"),
  bio: z.string().optional(),
  performerHourlyRateUsd: z.coerce.number().min(0, "Rate must be non-negative"),
  publicWebsiteUrl: z.string().optional(),
  publicInstagramUrl: z.string().optional(),
  publicYoutubeUrl: z.string().optional(),
});

export type BandProfileFormValues = z.infer<typeof bandProfileSchema>;

export const bandInviteSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.enum(["org_admin", "org_member"]),
});

export type BandInviteFormValues = z.infer<typeof bandInviteSchema>;
