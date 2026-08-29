import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { resolveStoredR2AssetUrl } from "../inventoryR2";
import type { AuthUser } from "./auth";

/** Portal profile photo (Convex storage) wins over Better Auth `user.image`. */
export async function resolveUserProfileImageUrl(
  ctx: QueryCtx | MutationCtx,
  args: {
    avatarStorageId?: Id<"_storage">;
    authImage?: string | null;
  },
): Promise<string | undefined> {
  if (args.avatarStorageId) {
    const uploaded = (await ctx.storage.getUrl(args.avatarStorageId)) ?? undefined;
    if (uploaded) return uploaded;
  }
  const authImage = args.authImage?.trim();
  if (!authImage) return undefined;
  const resolved = await resolveStoredR2AssetUrl(authImage);
  if (resolved) return resolved;
  if (/^https?:\/\//i.test(authImage)) return authImage;
  return authImage;
}

async function loadProfilesByUserIds(
  ctx: QueryCtx,
  userIds: readonly string[],
): Promise<Map<string, { avatarStorageId?: Id<"_storage"> }>> {
  const profiles = new Map<string, { avatarStorageId?: Id<"_storage"> }>();
  await Promise.all(
    userIds.map(async (userId) => {
      const row = await ctx.db
        .query("userAdminProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .unique();
      if (row) profiles.set(userId, row);
    }),
  );
  return profiles;
}

export async function buildUserProfileImageByUserId(
  ctx: QueryCtx,
  userIds: readonly string[],
  userByKey: Map<string, AuthUser>,
  profileByUserId?: Map<string, { avatarStorageId?: Id<"_storage"> }>,
): Promise<Map<string, string | undefined>> {
  const unique = [...new Set(userIds.map((id) => id.trim()).filter(Boolean))];
  const imageByUserId = new Map<string, string | undefined>();
  if (unique.length === 0) return imageByUserId;

  const profiles = profileByUserId ?? (await loadProfilesByUserIds(ctx, unique));

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
