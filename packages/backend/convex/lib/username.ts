import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * @handles for comment mentions. Stored on `userAdminProfiles.username`.
 * Lowercase letters, digits, underscore; 3–30 chars.
 */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

export function normalizeUsername(raw: string | undefined | null): string | undefined {
  const trimmed = raw?.trim().toLowerCase() ?? "";
  if (!trimmed) return undefined;
  if (!USERNAME_PATTERN.test(trimmed)) {
    throw new Error(
      "Username must be 3–30 characters and use only lowercase letters, numbers, and underscores.",
    );
  }
  return trimmed;
}

/** Email local-part → a valid username candidate (may still collide). */
export function usernameFromEmail(email: string): string | undefined {
  const local = email.trim().toLowerCase().split("@")[0] ?? "";
  const cleaned = local.replace(/[^a-z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
  if (cleaned.length < 3) return undefined;
  return cleaned.slice(0, 30);
}

/** Throws if another profile already owns this handle. */
export async function assertUsernameAvailable(
  ctx: QueryCtx | MutationCtx,
  username: string,
  forUserId: string,
) {
  const taken = await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_username", (q) => q.eq("username", username))
    .unique();
  if (taken && taken.userId !== forUserId) {
    throw new Error("That username is already taken.");
  }
}
