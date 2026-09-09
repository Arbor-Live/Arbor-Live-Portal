import { v } from "convex/values";

/**
 * Per-user participation in crew workflows. Missing/legacy fields behave like
 * a normal crew member (onboarding + timecards + assignable).
 */
export type UserParticipationFlags = {
  requiresOnboarding: boolean;
  includeInTimecards: boolean;
  assignableAsCrew: boolean;
  showOnPublicCrewPage: boolean;
};

export type UserInviteKind = "crew" | "advisor";

export const userInviteKindValue = v.union(v.literal("crew"), v.literal("advisor"));

export const CREW_PARTICIPATION_DEFAULTS: UserParticipationFlags = {
  requiresOnboarding: true,
  includeInTimecards: true,
  assignableAsCrew: true,
  showOnPublicCrewPage: false,
};

/** One-click invite preset for advisors / supervisors. */
export const ADVISOR_PARTICIPATION_PRESET: UserParticipationFlags = {
  requiresOnboarding: false,
  includeInTimecards: false,
  assignableAsCrew: false,
  showOnPublicCrewPage: false,
};

export function participationForInviteKind(kind: UserInviteKind | undefined): UserParticipationFlags {
  return kind === "advisor" ? ADVISOR_PARTICIPATION_PRESET : CREW_PARTICIPATION_DEFAULTS;
}

export function resolveParticipationFlags(
  profile:
    | {
        requiresOnboarding?: boolean;
        includeInTimecards?: boolean;
        assignableAsCrew?: boolean;
        showOnPublicCrewPage?: boolean;
      }
    | null
    | undefined,
): UserParticipationFlags {
  return {
    requiresOnboarding: profile?.requiresOnboarding !== false,
    includeInTimecards: profile?.includeInTimecards !== false,
    assignableAsCrew: profile?.assignableAsCrew !== false,
    showOnPublicCrewPage: profile?.showOnPublicCrewPage === true,
  };
}
