import { v } from "convex/values";

/**
 * Portal lifecycle for a user profile.
 *
 * - `active`   — full participation: counted for availability, weekly digest,
 *                public crew page, and selectable for events.
 * - `inactive` — account still works and can self-reactivate on sign-in, but
 *                skipped by availability targeting and the weekly digest. Kept
 *                selectable for events, timecards, and comment mentions.
 * - `alumni`   — no dashboard access (Better Auth `banned`). Hidden from every
 *                picker, directory, and email; only visible in the Users list.
 */
export type UserStatus = "active" | "inactive" | "alumni";

export const userStatusValue = v.union(
  v.literal("active"),
  v.literal("inactive"),
  v.literal("alumni"),
);

/**
 * Widened during the `active` → `status` migration. Legacy profiles that were
 * `active: false` meant "removed", which maps to `alumni`.
 *
 * Accepts `unknown` so callers can pass profile-ish projections (e.g. a mapped
 * `{ username, assignableAsCrew }` row) without importing the full doc type.
 */
export function resolveUserStatus(profile: unknown): UserStatus {
  const source = profile as { status?: unknown; active?: unknown } | null | undefined;
  const status = source?.status;
  if (status === "active" || status === "inactive" || status === "alumni") return status;
  return source?.active === false ? "alumni" : "active";
}

export function isActiveStatus(status: UserStatus): boolean {
  return status === "active";
}

export function isAlumniStatus(status: UserStatus): boolean {
  return status === "alumni";
}

/** Inactive users stay assignable to events; alumni do not. */
export function isAssignableStatus(status: UserStatus): boolean {
  return status !== "alumni";
}
