import { z } from "zod";

export const USER_VERTICAL_OPTIONS = ["Operations", "Crew", "Trivia", "Marketing"] as const;
export const USER_DISCIPLINE_OPTIONS = ["Sound", "Lights", "Design"] as const;
export const CREW_RATE_MODE_OPTIONS = ["normal", "lead", "custom"] as const;
export const PAYROLL_METHOD_OPTIONS = ["stanford", "external"] as const;

/** @deprecated Use USER_VERTICAL_OPTIONS / USER_DISCIPLINE_OPTIONS */
export const ADMIN_TEAM_OPTIONS = ["Sound", "Lights", "Design", "Marketing", "Operations"] as const;

export const userVerticalOptionSchema = z.enum(USER_VERTICAL_OPTIONS);
export const userDisciplineOptionSchema = z.enum(USER_DISCIPLINE_OPTIONS);
export const crewRateModeSchema = z.enum(CREW_RATE_MODE_OPTIONS);
export const payrollMethodSchema = z.enum(PAYROLL_METHOD_OPTIONS);

export type UserVerticalOption = z.infer<typeof userVerticalOptionSchema>;
export type UserDisciplineOption = z.infer<typeof userDisciplineOptionSchema>;
export type CrewRateModeOption = z.infer<typeof crewRateModeSchema>;
export type PayrollMethodOption = z.infer<typeof payrollMethodSchema>;

/** @deprecated */
export const adminTeamOptionSchema = z.enum(ADMIN_TEAM_OPTIONS);
/** @deprecated */
export type AdminTeamOption = z.infer<typeof adminTeamOptionSchema>;

export const userAdminRowSchema = z
  .object({
    role: z.string(),
    active: z.boolean(),
    showOnPublicCrewPage: z.boolean(),
    publicCrewDescription: z.string(),
    title: z.string(),
    phone: z.string(),
    rateMode: crewRateModeSchema,
    hourlyRateUsd: z.string(),
    payrollMethod: payrollMethodSchema,
    verticals: z.array(userVerticalOptionSchema),
    disciplines: z.array(userDisciplineOptionSchema),
    defaultOrganizationId: z.string(),
  })
  .superRefine((values, ctx) => {
    if (values.rateMode === "custom") {
      const parsed = Number(values.hourlyRateUsd);
      if (!Number.isFinite(parsed) || parsed < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid custom hourly rate",
          path: ["hourlyRateUsd"],
        });
      }
    }
  });

export type UserAdminRowFormValues = z.infer<typeof userAdminRowSchema>;

export const bandOrgProfileSchema = z.object({
  displayName: z.string(),
  bio: z.string(),
  oneLiner: z.string(),
  genres: z.string(),
  performerHourlyRateUsd: z.coerce.number().min(0, "Rate must be non-negative"),
  designatedPayeeUserId: z.string(),
  designatedPayeeName: z.string(),
  designatedPayeeEmail: z.string(),
  designatedPayeeMailingAddress: z.string(),
  designatedPayeePayoutMethod: z.enum(["pickup", "delivery"]).or(z.literal("")),
  mainContactName: z.string(),
  mainContactEmail: z.string(),
  mainContactPhone: z.string(),
  publicWebsiteUrl: z.string(),
  publicInstagramUrl: z.string(),
  publicYoutubeUrl: z.string(),
  publicSpotifyUrl: z.string(),
  demoURL: z.string(),
  publicListing: z.boolean(),
  publicSlug: z.string(),
  publicHeroImageUrl: z.string(),
});

export type BandOrgProfileFormValues = z.infer<typeof bandOrgProfileSchema>;

export const inviteUserSchema = z
  .object({
    email: z.string().email("Enter a valid email"),
    role: z.string(),
    verticals: z.array(userVerticalOptionSchema),
    disciplines: z.array(userDisciplineOptionSchema),
    rateMode: crewRateModeSchema.optional(),
    customHourlyRateUsd: z.string().optional(),
    payrollMethod: payrollMethodSchema.optional(),
  })
  .superRefine((values, ctx) => {
    if (values.rateMode === "custom") {
      const parsed = Number(values.customHourlyRateUsd ?? "");
      if (!Number.isFinite(parsed) || parsed < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid custom hourly rate",
          path: ["customHourlyRateUsd"],
        });
      }
    }
  });

export type InviteUserFormValues = z.infer<typeof inviteUserSchema>;

export const createUserAdminSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    title: z.string(),
    email: z.string().email("Enter a valid email"),
    password: z.string().min(1, "Temporary password is required"),
    role: z.string(),
    verticals: z.array(userVerticalOptionSchema),
    disciplines: z.array(userDisciplineOptionSchema),
    rateMode: crewRateModeSchema,
    hourlyRateUsd: z.string(),
    payrollMethod: payrollMethodSchema,
  })
  .superRefine((values, ctx) => {
    if (values.rateMode === "custom") {
      const parsed = Number(values.hourlyRateUsd);
      if (!Number.isFinite(parsed) || parsed < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid custom hourly rate",
          path: ["hourlyRateUsd"],
        });
      }
    }
  });

export type CreateUserAdminFormValues = z.infer<typeof createUserAdminSchema>;

export const editInviteSchema = z.object({
  role: z.string(),
  verticals: z.array(userVerticalOptionSchema),
  disciplines: z.array(userDisciplineOptionSchema),
});

export type EditInviteFormValues = z.infer<typeof editInviteSchema>;
