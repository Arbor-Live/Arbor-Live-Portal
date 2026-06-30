import { z } from "zod";

export const ADMIN_TEAM_OPTIONS = ["Sound", "Lights", "Design", "Marketing", "Operations"] as const;

export const adminTeamOptionSchema = z.enum(ADMIN_TEAM_OPTIONS);

export type AdminTeamOption = z.infer<typeof adminTeamOptionSchema>;

export const userAdminRowSchema = z.object({
  role: z.string(),
  active: z.boolean(),
  showOnPublicCrewPage: z.boolean(),
  title: z.string(),
  phone: z.string(),
  hourlyRateUsd: z.string(),
  teams: z.array(adminTeamOptionSchema),
  defaultOrganizationId: z.string(),
});

export type UserAdminRowFormValues = z.infer<typeof userAdminRowSchema>;

export const bandOrgProfileSchema = z.object({
  displayName: z.string(),
  bio: z.string(),
  performerHourlyRateUsd: z.string(),
  publicWebsiteUrl: z.string(),
  publicInstagramUrl: z.string(),
  publicYoutubeUrl: z.string(),
  publicListing: z.boolean(),
  publicSlug: z.string(),
  publicHeroImageUrl: z.string(),
});

export type BandOrgProfileFormValues = z.infer<typeof bandOrgProfileSchema>;

export const inviteUserSchema = z.object({
  email: z.string().email("Enter a valid email"),
  role: z.string(),
  teams: z.array(adminTeamOptionSchema),
});

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>;

export const createUserAdminSchema = z.object({
  name: z.string().min(1, "Name is required"),
  title: z.string(),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Temporary password is required"),
  role: z.string(),
  teams: z.array(adminTeamOptionSchema),
  hourlyRateUsd: z.string(),
});

export type CreateUserAdminFormValues = z.infer<typeof createUserAdminSchema>;

export const editInviteSchema = z.object({
  role: z.string(),
  teams: z.array(adminTeamOptionSchema),
});

export type EditInviteFormValues = z.infer<typeof editInviteSchema>;
