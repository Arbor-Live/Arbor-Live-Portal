import { cartGroupForBlockType, type CartGroup } from "@arbor/format";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { crewSections } from "../lib/crewAvailability";
import { eventDashboardUrl, formatEventDateRange, subjectForTemplate } from "./constants";
import { enqueueEmail } from "./enqueue";

/** First start → last end of one cart group's sections, or undefined if it has none. */
function groupWindowLabel(
  blocks: Doc<"eventScheduleBlocks">[],
  group: CartGroup,
  timezone: string,
) {
  const sections = crewSections(blocks).filter(
    (block) => cartGroupForBlockType(block.blockType) === group,
  );
  if (!sections.length) return undefined;
  const startsAt = Math.min(...sections.map((block) => block.startsAt));
  const endsAt = Math.max(...sections.map((block) => block.endsAt));
  return formatEventDateRange(startsAt, endsAt, timezone);
}

/**
 * Email the Ops Center golf cart recipients when a cart event moves to Ready.
 * Portal admins are not added automatically; only the configured list hears.
 * `readyAt` keys the send to this transition, so replays are no-ops but a
 * later return to Ready notifies again.
 */
export async function scheduleGolfCartEventReadyEmails(
  ctx: MutationCtx,
  eventId: Id<"events">,
  readyAt: number,
) {
  const event = await ctx.db.get(eventId);
  if (!event?.needsCart) return;
  const settings = await ctx.db.query("golfCartSettings").first();
  const recipients = (settings?.alertRecipients ?? []).filter(Boolean);
  if (!recipients.length) return;

  const blocks = await ctx.db
    .query("eventScheduleBlocks")
    .withIndex("by_eventId_and_startsAt", (q) => q.eq("eventId", eventId))
    .take(200);
  const payload = {
    eventTitle: event.title,
    venueName: event.venueName,
    dateRangeLabel: formatEventDateRange(event.startAt, event.endAt, event.timezone),
    eventUrl: eventDashboardUrl(eventId),
    setupLabel: groupWindowLabel(blocks, "setup", event.timezone),
    strikeLabel: groupWindowLabel(blocks, "strike", event.timezone),
  };
  const subject = subjectForTemplate("golf_cart_event_ready", event.title);

  for (const to of recipients) {
    await enqueueEmail(ctx, {
      template: "golf_cart_event_ready",
      to,
      subject,
      eventId,
      idempotencyKey: `golf_cart_event_ready:${eventId}:${readyAt}:${to}`,
      payload,
    });
  }
}
