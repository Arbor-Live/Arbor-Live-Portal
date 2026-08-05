import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { components, internal } from "../_generated/api";
import {
  EVENT_TIMEZONE,
  bandDashboardUrl,
  formatEventDateRange,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";

function roleLabel(role: "headliner" | "support" | "other") {
  if (role === "headliner") return "Headliner";
  if (role === "support") return "Support";
  return "Other";
}

type AuthOrganization = { id?: string; _id?: string; name?: string };

function getRecordId(row: { id?: string; _id?: string } | null | undefined) {
  return row?.id ?? row?._id ?? "";
}

async function resolveBandName(ctx: MutationCtx, organizationId: string) {
  const profile = await ctx.db
    .query("organizationProfiles")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", organizationId))
    .unique();
  if (profile?.displayName?.trim()) return profile.displayName.trim();
  const orgRows = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "organization",
    paginationOpts: { cursor: null, numItems: 500 },
  })) as { page?: AuthOrganization[] } | null;
  const org = (orgRows?.page ?? []).find((row) => getRecordId(row) === organizationId);
  return org?.name ?? "your band";
}

export async function scheduleBandAssignedEmails(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    organizationId: string;
    role: "headliner" | "support" | "other";
  },
) {
  const event = await ctx.db.get(args.eventId);
  if (!event) return;

  const memberships = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", args.organizationId))
    .take(200);
  const activeMemberIds = memberships.filter((row) => row.active).map((row) => row.userId);
  if (activeMemberIds.length === 0) return;

  const users = await ctx.runQuery(internal.bandPayments.listBandMemberEmails, {
    userIds: activeMemberIds,
  });
  const bandName = await resolveBandName(ctx, args.organizationId);

  const dateRangeLabel = formatEventDateRange(
    event.startAt,
    event.endAt,
    event.timezone || EVENT_TIMEZONE,
  );
  const dashboardUrl = bandDashboardUrl();
  const role = roleLabel(args.role);

  for (const member of users) {
    if (!member.email) continue;
    await enqueueEmail(ctx, {
      template: "band_assigned",
      to: member.email,
      subject: subjectForTemplate("band_assigned", event.title),
      eventId: event._id,
      idempotencyKey: `band_assigned:${args.eventId}:${args.organizationId}:${member.userId}`,
      payload: {
        recipientName: member.name?.split(" ")[0] ?? member.name,
        bandName,
        eventTitle: event.title,
        venueName: event.venueName,
        dateRangeLabel,
        roleLabel: role,
        dashboardUrl,
      },
    });
  }
}
