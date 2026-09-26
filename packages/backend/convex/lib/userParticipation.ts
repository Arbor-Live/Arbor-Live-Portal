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
  /** Receive the weekly email digest of pending activity. */
  weeklyDigest: boolean;
  /** Receive Operations emails when crew file a damage report. */
  damageReportEmails: boolean;
};

export type UserInviteKind = "crew" | "advisor";

export const userInviteKindValue = v.union(v.literal("crew"), v.literal("advisor"));

export type ParticipationSource = {
  requiresOnboarding?: boolean;
  includeInTimecards?: boolean;
  assignableAsCrew?: boolean;
  showOnPublicCrewPage?: boolean;
  weeklyDigest?: boolean;
  damageReportEmails?: boolean;
};

export const CREW_PARTICIPATION_DEFAULTS: UserParticipationFlags = {
  requiresOnboarding: true,
  includeInTimecards: true,
  assignableAsCrew: true,
  showOnPublicCrewPage: false,
  weeklyDigest: true,
  damageReportEmails: true,
};

/** One-click invite preset for advisors / supervisors. */
export const ADVISOR_PARTICIPATION_PRESET: UserParticipationFlags = {
  requiresOnboarding: false,
  includeInTimecards: false,
  assignableAsCrew: false,
  showOnPublicCrewPage: false,
  weeklyDigest: true,
  damageReportEmails: false,
};

export function participationForInviteKind(kind: UserInviteKind | undefined): UserParticipationFlags {
  return kind === "advisor" ? ADVISOR_PARTICIPATION_PRESET : CREW_PARTICIPATION_DEFAULTS;
}

/**
 * Advisor invites store the three crew flags as false and historically omitted
 * `damageReportEmails`. Treat that combination as opted out of damage-report
 * emails so existing advisors stop getting the Operations blast.
 */
function defaultDamageReportEmails(profile: ParticipationSource): boolean {
  if (profile.damageReportEmails !== undefined) return profile.damageReportEmails;
  return !(
    profile.requiresOnboarding === false &&
    profile.includeInTimecards === false &&
    profile.assignableAsCrew === false
  );
}

export function resolveParticipationFlags(
  profile: ParticipationSource | null | undefined,
): UserParticipationFlags {
  return {
    requiresOnboarding: profile?.requiresOnboarding !== false,
    includeInTimecards: profile?.includeInTimecards !== false,
    assignableAsCrew: profile?.assignableAsCrew !== false,
    showOnPublicCrewPage: profile?.showOnPublicCrewPage === true,
    weeklyDigest: profile?.weeklyDigest !== false,
    damageReportEmails: defaultDamageReportEmails(profile ?? {}),
  };
}
