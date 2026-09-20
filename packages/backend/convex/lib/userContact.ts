import type { MutationCtx, QueryCtx } from "../_generated/server";
import { findAuthUserById } from "./auth";

export type UserContact = {
  name?: string;
  email?: string;
  phone?: string;
};

/** Resolve a portal user's display name, email, and phone for contact surfaces. */
export async function resolveUserContact(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<UserContact | null> {
  const user = await findAuthUserById(ctx, userId);
  if (!user) return null;
  const profile = await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  return {
    name: user.name?.trim() || undefined,
    email: user.email?.trim().toLowerCase() || undefined,
    phone: profile?.phone?.trim() || undefined,
  };
}
