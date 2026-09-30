import { z } from "zod";
import { bandPublicListingRefinement } from "@/lib/validations/bands";

export const USER_VERTICAL_OPTIONS = ["Operations", "Crew", "Trivia", "Marketing"] as const;
export const USER_DISCIPLINE_OPTIONS = [
  "Sound",
  "Lights",
  "Design",
  "Photography",
  "Videography",
] as const;

/** Disciplines a member may hold for each vertical. */
export const DISCIPLINES_BY_VERTICAL: Record<
  (typeof USER_VERTICAL_OPTIONS)[number],
  readonly (typeof USER_DISCIPLINE_OPTIONS)[number][]
> = {
  Operations: [],
  Crew: ["Sound", "Lights", "Photography", "Videography"],
  Trivia: [],
  Marketing: ["Design", "Photography", "Videography"],
};

export const CREW_RATE_MODE_OPTIONS = ["normal", "lead", "custom"] as const;
export const PAYROLL_METHOD_OPTIONS = ["stanford", "external"] as const;
export const USER_INVITE_KIND_OPTIONS = ["crew", "advisor"] as const;
/** Mirrors the crew application `stanfordPosition` field. */
export const STANFORD_POSITION_OPTIONS = [
  "undergrad",
  "coterm",
  "masters",
  "phd",
  "postdoc",
  "other",
] as const;
export const STANFORD_POSITION_LABELS: Record<(typeof STANFORD_POSITION_OPTIONS)[number], string> = {
  undergrad: "Undergrad",
  coterm: "Coterm",
  masters: "Master's",
  phd: "PhD",
  postdoc: "Postdoc",
  other: "Other",
};

/** @deprecated Use USER_VERTICAL_OPTIONS / USER_DISCIPLINE_OPTIONS */
export const ADMIN_TEAM_OPTIONS = ["Sound", "Lights", "Design", "Marketing", "Operations"] as const;

export const userVerticalOptionSchema = z.enum(USER_VERTICAL_OPTIONS);
export const userDisciplineOptionSchema = z.enum(USER_DISCIPLINE_OPTIONS);
export const crewRateModeSchema = z.enum(CREW_RATE_MODE_OPTIONS);
export const payrollMethodSchema = z.enum(PAYROLL_METHOD_OPTIONS);
export const userInviteKindSchema = z.enum(USER_INVITE_KIND_OPTIONS);
export const stanfordPositionSchema = z.enum(STANFORD_POSITION_OPTIONS);

export type UserVerticalOption = z.infer<typeof userVerticalOptionSchema>;
export type UserDisciplineOption = z.infer<typeof userDisciplineOptionSchema>;
export type CrewRateModeOption = z.infer<typeof crewRateModeSchema>;
export type PayrollMethodOption = z.infer<typeof payrollMethodSchema>;
export type UserInviteKindOption = z.infer<typeof userInviteKindSchema>;
export type StanfordPositionOption = z.infer<typeof stanfordPositionSchema>;

/** Every discipline available across the given verticals, in canonical order. */
export function disciplinesForVerticals(
  verticals: readonly UserVerticalOption[],
): UserDisciplineOption[] {
  const allowed = new Set<UserDisciplineOption>();
  for (const vertical of verticals) {
    for (const discipline of DISCIPLINES_BY_VERTICAL[vertical]) {
      allowed.add(discipline);
    }
  }
  return USER_DISCIPLINE_OPTIONS.filter((discipline) => allowed.has(discipline));
}

/** @deprecated */
export const adminTeamOptionSchema = z.enum(ADMIN_TEAM_OPTIONS);
/** @deprecated */
export type AdminTeamOption = z.infer<typeof adminTeamOptionSchema>;

export const userAdminRowSchema = z
  .object({
    role: z.string(),
    name: z.string().min(1, "Name is required"),
    username: z.string(),
    requiresOnboarding: z.boolean(),
    includeInTimecards: z.boolean(),
    assignableAsCrew: z.boolean(),
    emailOptOuts: z.array(z.string()),
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

export const bandOrgProfileSchema = z
  .object({
    displayName: z.string(),
    bio: z.string(),
    oneLiner: z.string(),
    genres: z.string(),
    organizationType: z.string().optional(),
    demoURL: z.string(),
    bandMembers: z.string(),
    mainContactName: z.string(),
    mainContactEmail: z.string(),
    mainContactPhone: z.string(),
    performerHourlyRateUsd: z.coerce.number().min(0, "Rate must be non-negative"),
    designatedPayeeUserId: z.string(),
    designatedPayeeName: z.string(),
    designatedPayeeEmail: z.string(),
    designatedPayeeMailingAddress: z.string(),
    designatedPayeePayoutMethod: z.enum(["pickup", "delivery"]).or(z.literal("")),
    artistLinks: z
      .array(z.object({ label: z.string(), url: z.string(), icon: z.string().optional() }))
      .optional(),
    publicListing: z.boolean(),
    publicSlug: z.string(),
    publicHeroImageUrl: z.string(),
  })
  .superRefine(bandPublicListingRefinement);

export type BandOrgProfileFormValues = z.infer<typeof bandOrgProfileSchema>;

export const ADD_PERSON_MODE_OPTIONS = ["invite", "create"] as const;

/**
 * The Add person dialog: send an invite, or create the account directly with a
 * temporary password. Name and password only apply to "create"; the crew
 * compensation fields only apply to a crew (not advisor) Arbor Live member.
 */
export const addPersonSchema = z
  .object({
    mode: z.enum(ADD_PERSON_MODE_OPTIONS),
    organizationId: z.string().min(1, "Select an organization"),
    email: z.string().email("Enter a valid email"),
    name: z.string(),
    title: z.string(),
    password: z.string(),
    role: z.string(),
    inviteKind: userInviteKindSchema,
    verticals: z.array(userVerticalOptionSchema),
    disciplines: z.array(userDisciplineOptionSchema),
    rateMode: crewRateModeSchema,
    customHourlyRateUsd: z.string(),
    payrollMethod: payrollMethodSchema,
  })
  .superRefine((values, ctx) => {
    if (values.mode === "create") {
      if (!values.name.trim()) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Name is required", path: ["name"] });
      }
      if (!values.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Temporary password is required",
          path: ["password"],
        });
      }
    }
    if (values.inviteKind === "advisor") return;
    if (values.rateMode === "custom") {
      const parsed = Number(values.customHourlyRateUsd);
      if (!values.customHourlyRateUsd.trim() || !Number.isFinite(parsed) || parsed < 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Enter a valid custom hourly rate",
          path: ["customHourlyRateUsd"],
        });
      }
    }
  });

export type AddPersonFormValues = z.infer<typeof addPersonSchema>;

export const editInviteSchema = z.object({
  role: z.string(),
  verticals: z.array(userVerticalOptionSchema),
  disciplines: z.array(userDisciplineOptionSchema),
});

export type EditInviteFormValues = z.infer<typeof editInviteSchema>;
