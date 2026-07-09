import { z } from "zod";

export const USER_VERTICAL_OPTIONS = ["Operations", "Crew", "Trivia", "Marketing"] as const;
export const USER_DISCIPLINE_OPTIONS = ["Sound", "Lights", "Design"] as const;

/** @deprecated Use USER_VERTICAL_OPTIONS / USER_DISCIPLINE_OPTIONS */
export const ADMIN_TEAM_OPTIONS = ["Sound", "Lights", "Design", "Marketing", "Operations"] as const;

export const userVerticalOptionSchema = z.enum(USER_VERTICAL_OPTIONS);
export const userDisciplineOptionSchema = z.enum(USER_DISCIPLINE_OPTIONS);

export type UserVerticalOption = z.infer<typeof userVerticalOptionSchema>;
export type UserDisciplineOption = z.infer<typeof userDisciplineOptionSchema>;

/** @deprecated */
export const adminTeamOptionSchema = z.enum(ADMIN_TEAM_OPTIONS);
/** @deprecated */
export type AdminTeamOption = z.infer<typeof adminTeamOptionSchema>;

export const userAdminRowSchema = z.object({
  role: z.string(),
  active: z.boolean(),
  showOnPublicCrewPage: z.boolean(),
  publicCrewDescription: z.string(),
  title: z.string(),
  phone: z.string(),
  hourlyRateUsd: z.string(),
  verticals: z.array(userVerticalOptionSchema),
  disciplines: z.array(userDisciplineOptionSchema),
  defaultOrganizationId: z.string(),
});

export type UserAdminRowFormValues = z.infer<typeof userAdminRowSchema>;

export const bandOrgProfileSchema = z.object({
  displayName: z.string(),
  bio: z.string(),
  performerHourlyRateUsd: z.string(),
  designatedPayeeUserId: z.string(),
  designatedPayeeName: z.string(),
  designatedPayeeEmail: z.string(),
  designatedPayeeMailingAddress: z.string(),
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
  verticals: z.array(userVerticalOptionSchema),
  disciplines: z.array(userDisciplineOptionSchema),
});

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>;

export const createUserAdminSchema = z.object({
  name: z.string().min(1, "Name is required"),
  title: z.string(),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Temporary password is required"),
  role: z.string(),
  verticals: z.array(userVerticalOptionSchema),
  disciplines: z.array(userDisciplineOptionSchema),
  hourlyRateUsd: z.string(),
});

export type CreateUserAdminFormValues = z.infer<typeof createUserAdminSchema>;

export const editInviteSchema = z.object({
  role: z.string(),
  verticals: z.array(userVerticalOptionSchema),
  disciplines: z.array(userDisciplineOptionSchema),
});

export type EditInviteFormValues = z.infer<typeof editInviteSchema>;
