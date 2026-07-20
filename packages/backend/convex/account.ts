import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { components } from "./_generated/api";
import { internalAction, mutation, query, type MutationCtx } from "./_generated/server";
import { createAuth } from "./auth";
import { SITE_URL } from "./email/constants";
import { getUserId, requireAuth } from "./lib/auth";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export const getMyAccount = query({
  args: {},
  returns: v.object({
    userId: v.string(),
    name: v.string(),
    email: v.string(),
    emailVerified: v.boolean(),
    image: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    calendarInviteEmail: v.optional(v.string()),
    publicCrewDescription: v.optional(v.string()),
  }),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const profile = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    let avatarUrl: string | undefined;
    if (profile?.avatarStorageId) {
      avatarUrl = (await ctx.storage.getUrl(profile.avatarStorageId)) ?? undefined;
    }

    return {
      userId,
      name: user.name ?? user.email ?? "User",
      email: user.email ?? "",
      emailVerified: Boolean((user as { emailVerified?: boolean }).emailVerified),
      image: (user as { image?: string | null }).image ?? undefined,
      avatarUrl,
      phone: profile?.phone,
      title: profile?.title,
      calendarInviteEmail: profile?.calendarInviteEmail ?? "",
      publicCrewDescription: profile?.publicCrewDescription,
    };
  },
});

export const generateAvatarUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await requireAuth(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

async function assertAvatarStorageFile(ctx: MutationCtx, storageId: Id<"_storage">) {
  const metadata = await ctx.db.system.get(storageId);
  if (!metadata) {
    throw new Error("Uploaded image was not found.");
  }
  if (metadata.size > MAX_AVATAR_BYTES) {
    throw new Error("Profile image must be 2 MB or smaller.");
  }
  const contentType = metadata.contentType ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error("Profile image must be an image file.");
  }
}

async function syncAuthUserImage(
  ctx: MutationCtx,
  email: string | undefined,
  image: string | null,
) {
  if (!email) return;
  await ctx.runMutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: "user",
      where: [{ field: "email", value: email }],
      update: {
        image,
        updatedAt: Date.now(),
      },
    },
  });
}

export const setMyAvatar = mutation({
  args: { storageId: v.id("_storage") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    await assertAvatarStorageFile(ctx, args.storageId);
    const avatarUrl = (await ctx.storage.getUrl(args.storageId)) ?? null;

    const now = Date.now();
    const existing = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        avatarStorageId: args.storageId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userAdminProfiles", {
        userId,
        active: true,
        verticals: [],
        disciplines: [],
        avatarStorageId: args.storageId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await syncAuthUserImage(ctx, user.email, avatarUrl);
    return null;
  },
});

export const updateMyProfileDetails = mutation({
  args: {
    phone: v.optional(v.string()),
    title: v.optional(v.string()),
    calendarInviteEmail: v.optional(v.string()),
    publicCrewDescription: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const now = Date.now();
    const phone = args.phone?.trim() || undefined;
    const title = args.title?.trim() || undefined;
    const calendarInviteEmail = args.calendarInviteEmail?.trim().toLowerCase() || undefined;
    const publicCrewDescription = args.publicCrewDescription?.trim() || undefined;
    if (calendarInviteEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(calendarInviteEmail)) {
      throw new Error("Enter a valid calendar invite email address.");
    }

    const existing = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        phone,
        title,
        calendarInviteEmail,
        publicCrewDescription,
        updatedAt: now,
      });
      return null;
    }

    await ctx.db.insert("userAdminProfiles", {
      userId,
      phone,
      title,
      calendarInviteEmail,
      publicCrewDescription,
      active: true,
      verticals: [],
      disciplines: [],
      createdAt: now,
      updatedAt: now,
    });
    return null;
  },
});

export const removeMyAvatar = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    const existing = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .unique();
    if (!existing?.avatarStorageId) return null;

    await ctx.db.patch(existing._id, {
      avatarStorageId: undefined,
      updatedAt: Date.now(),
    });
    await syncAuthUserImage(ctx, user.email, null);
    return null;
  },
});

export const requestPasswordResetInternal = internalAction({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const auth = createAuth(ctx);
    await auth.api.requestPasswordReset({
      body: {
        email: args.email,
        redirectTo: `${SITE_URL}/reset-password`,
      },
    });
    return null;
  },
});
