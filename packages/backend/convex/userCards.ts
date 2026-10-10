import { v } from "convex/values";
import { query } from "./_generated/server";
import { appError } from "./lib/errors";
import { findAuthUsersByIds, requireArborInternalContext, requireAuth } from "./lib/auth";
import { resolveUserProfileImageUrl } from "./lib/userProfileImage";
import { resolveUserStatus } from "./lib/userStatus";
import { sumShiftHoursInWindows } from "./lib/userShiftHours";

const MAX_PEOPLE = 200;

const hoursWindowValidator = v.object({ startMs: v.number(), endMs: v.number() });

function assertWindow(window: { startMs: number; endMs: number }) {
  if (!Number.isFinite(window.startMs) || !Number.isFinite(window.endMs) || window.endMs < window.startMs) {
    appError("INVALID_HOURS_WINDOW", "Invalid hours window.");
  }
}

/**
 * What a hover card on a person shows: who they are, how to reach them, and
 * (when windows are passed) the hours they're on shifts this week and quarter.
 */
export const getCard = query({
  args: {
    userId: v.string(),
    week: v.optional(hoursWindowValidator),
    quarter: v.optional(hoursWindowValidator),
  },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.string(),
      name: v.string(),
      email: v.optional(v.string()),
      phone: v.optional(v.string()),
      title: v.optional(v.string()),
      pronouns: v.optional(v.string()),
      username: v.optional(v.string()),
      gradYear: v.optional(v.number()),
      avatarUrl: v.optional(v.string()),
      status: v.union(v.literal("active"), v.literal("inactive"), v.literal("alumni")),
      weekHours: v.optional(v.number()),
      quarterHours: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    const userId = args.userId.trim();
    if (!userId) return null;
    if (args.week) assertWindow(args.week);
    if (args.quarter) assertWindow(args.quarter);

    const [userByKey, profileRows] = await Promise.all([
      findAuthUsersByIds(ctx, [userId]),
      ctx.db
        .query("userAdminProfiles")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .take(1),
    ]);
    const user = userByKey.get(userId);
    const profile = profileRows[0];
    if (!user && !profile) return null;

    const windows = [args.week, args.quarter].filter(
      (window): window is { startMs: number; endMs: number } => Boolean(window),
    );
    const hours = await sumShiftHoursInWindows(ctx, userId, windows);
    const weekHours = args.week ? hours[0] : undefined;
    const quarterHours = args.quarter ? hours[args.week ? 1 : 0] : undefined;

    return {
      userId,
      name: user?.name?.trim() || user?.email?.trim() || "Arbor Live user",
      email: user?.email?.trim() || undefined,
      phone: profile?.phone?.trim() || undefined,
      title: profile?.title?.trim() || undefined,
      pronouns: profile?.pronouns?.trim() || undefined,
      username: profile?.username || undefined,
      gradYear: profile?.gradYear,
      avatarUrl: await resolveUserProfileImageUrl(ctx, {
        avatarStorageId: profile?.avatarStorageId,
        authImage: user?.image,
      }),
      status: resolveUserStatus(profile),
      weekHours,
      quarterHours,
    };
  },
});

/**
 * Hours each person is on shifts in one window (a quarter), across every
 * event. The staffing picker sorts by it so work spreads to whoever has had
 * the least.
 */
export const listShiftHours = query({
  args: {
    userIds: v.array(v.string()),
    window: hoursWindowValidator,
  },
  returns: v.array(v.object({ userId: v.string(), hours: v.number() })),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    await requireArborInternalContext(ctx);
    assertWindow(args.window);
    const userIds = [...new Set(args.userIds.map((id) => id.trim()).filter(Boolean))].slice(0, MAX_PEOPLE);
    return await Promise.all(
      userIds.map(async (userId) => {
        const [hours] = await sumShiftHoursInWindows(ctx, userId, [args.window]);
        return { userId, hours: hours ?? 0 };
      }),
    );
  },
});
