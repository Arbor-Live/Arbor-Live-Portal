import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolveStoredR2AssetUrl } from "../inventoryR2";
import type { AuthUser } from "./auth";

type ProfileImageSource = { avatarStorageId?: Id<"_storage"> };

/** Portal profile photo (Convex storage) wins over Better Auth `user.image`. */
export async function resolveUserProfileImageUrl(
  ctx: QueryCtx | MutationCtx,
  args: {
    avatarStorageId?: Id<"_storage">;
    authImage?: string | null;
  },
): Promise<string | undefined> {
  if (args.avatarStorageId) {
    try {
      const uploaded = (await ctx.storage.getUrl(args.avatarStorageId)) ?? undefined;
      if (uploaded) return uploaded;
    } catch {
      // Fall through to Better Auth image when portal storage lookup fails.
    }
  }
  const authImage = args.authImage?.trim();
  if (!authImage) return undefined;
  try {
    const resolved = await resolveStoredR2AssetUrl(authImage);
    if (resolved) return resolved;
    if (/^https?:\/\//i.test(authImage)) return authImage;
    return authImage;
  } catch {
    return undefined;
  }
}

/** Indexed lookups for only the requested users (avoids scanning all active profiles). */
export async function loadAdminProfilesByUserIds(
  ctx: QueryCtx,
  userIds: readonly string[],
): Promise<Map<string, ProfileImageSource & { pronouns?: string; gradYear?: number }>> {
  const profiles = new Map<string, ProfileImageSource & { pronouns?: string; gradYear?: number }>();
  await Promise.all(
    userIds.map(async (userId) => {
      // Prefer first row over `.unique()` — the index is not a DB unique constraint.
      const row = await ctx.db
        .query("userAdminProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(1);
      const profile = row[0];
      if (profile) profiles.set(userId, profile);
    }),
  );
  return profiles;
}

export async function buildUserProfileImageByUserId(
  ctx: QueryCtx,
  userIds: readonly string[],
  userByKey: Map<string, AuthUser>,
  profileByUserId?: Map<string, ProfileImageSource>,
): Promise<Map<string, string | undefined>> {
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  const imageByUserId = new Map<string, string | undefined>();
  if (unique.length === 0) return imageByUserId;

  const profiles = profileByUserId ?? (await loadAdminProfilesByUserIds(ctx, unique));

  await Promise.all(
    unique.map(async (userId) => {
      const profile = profiles.get(userId);
      const user = userByKey.get(userId);
      imageByUserId.set(
        userId,
        await resolveUserProfileImageUrl(ctx, {
          avatarStorageId: profile?.avatarStorageId,
          authImage: user?.image,
        }),
      );
    }),
  );
  return imageByUserId;
}
