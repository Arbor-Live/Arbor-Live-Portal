import { components } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";
import { findAuthUserById } from "./auth";

const REMOVED_BY_ADMIN_BAN_REASON = "Removed by admin";

/** Write the Better Auth ban flag that matches a portal status. */
export async function setAuthUserBanState(
  ctx: MutationCtx,
  email: string,
  banned: boolean,
  now: number,
): Promise<void> {
  await ctx.runMutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: "user",
      where: [{ field: "email", value: email.trim().toLowerCase() }],
      update: {
        banned,
        banReason: banned ? REMOVED_BY_ADMIN_BAN_REASON : null,
        banExpires: null,
        updatedAt: now,
      },
    },
  });
}

/**
 * Lift any ban for an existing account so it can sign in again. Invite,
 * re-invite, and convert flows set `status: "active"`; without this they could
 * leave a previously-removed (alumni) account active-but-banned — status says
 * active while Better Auth still rejects the session.
 */
export async function clearUserBan(ctx: MutationCtx, userId: string): Promise<void> {
  const user = await findAuthUserById(ctx, userId);
  const email = user?.email?.trim();
  if (!email) return;
  await setAuthUserBanState(ctx, email, false, Date.now());
}
