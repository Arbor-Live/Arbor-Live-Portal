import { payPeriodStatus, recentPayPeriods } from "@arbor/format";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { findAuthUsersByIds, getUserId, requireAdmin, requireArborInternalContext, requireAuth } from "./lib/auth";
import { isStaffMember, resolveProfileMembership } from "./lib/userVerticals";
import { buildTimecardPeriodSummaryForUser, buildUserTimecards } from "./lib/userTimecards";

const timecardEventValue = v.object({
  eventId: v.id("events"),
  title: v.string(),
  actualHours: v.number(),
  inputHours: v.number(),
});

const timecardDayValue = v.object({
  dateMs: v.number(),
  events: v.array(timecardEventValue),
  totalActual: v.number(),
  totalInput: v.number(),
});

const timecardPeriodValue = v.object({
  startMs: v.number(),
  endMs: v.number(),
  dueMs: v.number(),
  label: v.string(),
  status: v.union(v.literal("open"), v.literal("due"), v.literal("past_due")),
  daysWorked: v.number(),
  days: v.array(timecardDayValue),
});

const timecardOverviewRowValue = v.object({
  userId: v.string(),
  name: v.string(),
  email: v.string(),
  daysWorked: v.number(),
  totalActualHours: v.number(),
  totalInputHours: v.number(),
});

const timecardOverviewValue = v.object({
  period: v.object({
    startMs: v.number(),
    endMs: v.number(),
    dueMs: v.number(),
    label: v.string(),
    status: v.union(v.literal("open"), v.literal("due"), v.literal("past_due")),
  }),
  rows: v.array(timecardOverviewRowValue),
});

export const getMyTimecards = query({
  args: {
    now: v.number(),
  },
  returns: v.array(timecardPeriodValue),
  handler: async (ctx, args) => {
    const user = await requireAuth(ctx);
    const userId = getUserId(user);
    return await buildUserTimecards(ctx, userId, args.now, 3);
  },
});

export const listCrewTimecardOverview = query({
  args: {
    now: v.number(),
    periodIndex: v.optional(v.number()),
  },
  returns: timecardOverviewValue,
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);

    const periods = recentPayPeriods(args.now, 3);
    const periodIndex = Math.min(Math.max(args.periodIndex ?? 0, 0), periods.length - 1);
    const period = periods[periodIndex]!;

    const profiles = await ctx.db
      .query("userAdminProfiles")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(500);
    const crewProfiles = profiles.filter((profile) =>
      isStaffMember(resolveProfileMembership(profile)),
    );

    const summaries = await Promise.all(
      crewProfiles.map(async (profile) => {
        const summary = await buildTimecardPeriodSummaryForUser(ctx, profile.userId, period, args.now);
        return { profile, summary };
      }),
    );

    const userIds = crewProfiles.map((profile) => profile.userId);
    const userByKey = await findAuthUsersByIds(ctx, userIds);

    const rows = summaries
      .map(({ profile, summary }) => {
        const user = userByKey.get(profile.userId);
        return {
          userId: profile.userId,
          name: user?.name ?? user?.email ?? profile.userId,
          email: user?.email ?? "",
          daysWorked: summary.daysWorked,
          totalActualHours: summary.totalActualHours,
          totalInputHours: summary.totalInputHours,
        };
      })
      .sort((a, b) => b.daysWorked - a.daysWorked || a.name.localeCompare(b.name));

    return {
      period: {
        startMs: period.startMs,
        endMs: period.endMs,
        dueMs: period.dueMs,
        label: period.label,
        status: payPeriodStatus(period, args.now),
      },
      rows,
    };
  },
});

export const getTimecardsForUser = query({
  args: {
    userId: v.string(),
    now: v.number(),
  },
  returns: v.object({
    userId: v.string(),
    name: v.string(),
    email: v.string(),
    periods: v.array(timecardPeriodValue),
  }),
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    await requireArborInternalContext(ctx);

    const userByKey = await findAuthUsersByIds(ctx, [args.userId]);
    const user = userByKey.get(args.userId);
    const periods = await buildUserTimecards(ctx, args.userId, args.now, 3);

    return {
      userId: args.userId,
      name: user?.name ?? user?.email ?? args.userId,
      email: user?.email ?? "",
      periods,
    };
  },
});
