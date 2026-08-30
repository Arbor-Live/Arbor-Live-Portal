import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  EVENT_TIMEZONE,
  SITE_URL,
  formatEventDateRange,
  subjectForTemplate,
} from "./constants";
import { enqueueEmail } from "./enqueue";

function roleLabel(role: "headliner" | "support" | "other") {
  if (role === "headliner") return "Headliner";
  if (role === "support") return "Support";
  return "Other";
}

export async function scheduleBandEventOnboardingInviteEmail(
  ctx: MutationCtx,
  args: {
    eventId: Id<"events">;
    organizationId: string;
    bandName: string;
    contactEmail: string;
    role: "headliner" | "support" | "other";
  },
) {
  const event = await ctx.db.get(args.eventId);
  if (!event) return;

  const email = args.contactEmail.trim().toLowerCase();
  if (!email) return;

  const portalUrl = `${SITE_URL}/sign-in?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent("/onboarding/band")}`;

  await enqueueEmail(ctx, {
    template: "band_event_onboarding_invite",
    to: email,
    subject: subjectForTemplate("band_event_onboarding_invite", event.title),
    eventId: event._id,
    idempotencyKey: `band_event_onboarding_invite:${args.eventId}:${args.organizationId}:${email}`,
    payload: {
      bandName: args.bandName,
      eventTitle: event.title,
      venueName: event.venueName,
      dateRangeLabel: formatEventDateRange(
        event.startAt,
        event.endAt,
        event.timezone || EVENT_TIMEZONE,
      ),
      roleLabel: roleLabel(args.role),
      portalUrl,
    },
  });
}
