import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { resolveBandName } from "../lib/bandIdentity";
import { EVENT_TIMEZONE, bandShowUrl, formatEventDateRange, subjectForTemplate } from "./constants";
import {
  cancelPendingDebouncedEmail,
  enqueueDebouncedEmail,
  hasSentDebouncedEmail,
} from "./enqueue";
import { bumpInviteSequence } from "./inviteSequence";
import { getUserScheduledEmailRecipient } from "./recipients";
import { formatBlockTimeRange } from "./scheduleEmailData";

export type ActSlot = "soundcheck" | "set";

const ACT_SLOTS: readonly ActSlot[] = ["soundcheck", "set"];
const SLOT_LABELS: Record<ActSlot, string> = { soundcheck: "Soundcheck", set: "Set" };

type LineupRow = Pick<
  Doc<"eventBandParticipations">,
  | "_id"
  | "eventId"
  | "organizationId"
  | "setStartsAt"
  | "setEndsAt"
  | "soundcheckStartsAt"
  | "soundcheckEndsAt"
>;

type Window = { startsAt: number; endsAt: number };

export function actSlotWindow(row: LineupRow | null, slot: ActSlot): Window | null {
  if (!row) return null;
  const startsAt = slot === "set" ? row.setStartsAt : row.soundcheckStartsAt;
  const endsAt = slot === "set" ? row.setEndsAt : row.soundcheckEndsAt;
  return startsAt != null && endsAt != null ? { startsAt, endsAt } : null;
}

export function bandInviteUid(participationId: Id<"eventBandParticipations">, slot: ActSlot) {
  return `band-${participationId}-${slot}@arbor.st`;
}

export function bandInviteDebounceKey(
  template: "band_scheduled" | "band_unscheduled",
  participationId: Id<"eventBandParticipations">,
  slot: ActSlot,
  userId: string,
) {
  return `${template}:${participationId}:${slot}:${userId}`;
}

/**
 * The lineup windows that need an email: changed and not already over (editing
 * a past show's run of show for the record shouldn't ping the band).
 */
export function changedActSlots(before: LineupRow | null, after: LineupRow | null, now: number) {
  return ACT_SLOTS.filter((slot) => {
    const previous = actSlotWindow(before, slot);
    const next = actSlotWindow(after, slot);
    if (previous?.startsAt === next?.startsAt && previous?.endsAt === next?.endsAt) return false;
    return (next ?? previous)!.endsAt > now;
  });
}

/**
 * Emails each active band member a calendar invite per lineup window
 * (soundcheck and set separately: Gmail and Outlook only add the first event of
 * an invite). A changed window re-sends its invite; a cleared one, or an act
 * leaving the bill, sends a cancellation if the invite already went out.
 *
 * Call after every write to an act's lineup times with the row before and after
 * (`after` null when the act is removed). Debounced like crew invites, so a
 * burst of Run of Show edits sends one email per window.
 */
export async function scheduleBandTimeEmails(
  ctx: MutationCtx,
  before: LineupRow | null,
  after: LineupRow | null,
) {
  const row = after ?? before;
  if (!row) return;
  const slots = changedActSlots(before, after, Date.now());
  if (slots.length === 0) return;
  const event = await ctx.db.get(row.eventId);
  if (!event || event.status === "cancelled") return;

  const memberships = await ctx.db
    .query("userOrganizationMemberships")
    .withIndex("by_organizationId", (q) => q.eq("organizationId", row.organizationId))
    .take(200);
  const members = [];
  for (const membership of memberships) {
    if (!membership.active) continue;
    const recipient = await getUserScheduledEmailRecipient(ctx, membership.userId);
    if (recipient) members.push(recipient);
  }
  if (members.length === 0) return;

  const timezone = event.timezone || EVENT_TIMEZONE;
  const bandName = await resolveBandName(ctx, row.organizationId);
  const sequence = await bumpInviteSequence(ctx, event._id);
  const base = {
    bandName,
    eventTitle: event.title,
    venueName: event.venueName,
    dateRangeLabel: formatEventDateRange(event.startAt, event.endAt, timezone),
    showUrl: bandShowUrl(event._id),
  };

  for (const slot of slots) {
    const slotLabel = SLOT_LABELS[slot];
    const next = actSlotWindow(after, slot);
    const previous = actSlotWindow(before, slot);
    const otherSlot: ActSlot = slot === "set" ? "soundcheck" : "set";
    const otherWindow = actSlotWindow(after, otherSlot);
    const otherSlotSummary = otherWindow
      ? `${SLOT_LABELS[otherSlot]} • ${formatBlockTimeRange(otherWindow.startsAt, otherWindow.endsAt, timezone)}`
      : undefined;
    const window = (next ?? previous)!;
    const icsEvent = {
      uid: bandInviteUid(row._id, slot),
      sequence,
      title: `${slotLabel}: ${event.title}`,
      description: [`${bandName} ${slotLabel.toLowerCase()}`, otherSlotSummary]
        .filter(Boolean)
        .join("\n"),
      location: event.venueName,
      startAt: window.startsAt,
      endAt: window.endsAt,
    };
    const timeRangeLabel = formatBlockTimeRange(window.startsAt, window.endsAt, timezone);
    const subjectContext = `${event.title} ${slotLabel.toLowerCase()}`;

    for (const member of members) {
      const recipientName = member.name?.split(" ")[0] ?? member.name;
      const scheduledKey = bandInviteDebounceKey("band_scheduled", row._id, slot, member.userId);
      const unscheduledKey = bandInviteDebounceKey("band_unscheduled", row._id, slot, member.userId);
      const fingerprint = `${window.startsAt}:${window.endsAt}`;

      if (next) {
        // A new time supersedes any pending removal notice.
        await cancelPendingDebouncedEmail(ctx, unscheduledKey);
        await enqueueDebouncedEmail(ctx, {
          template: "band_scheduled",
          to: member.email,
          recipientUserId: member.userId,
          subject: subjectForTemplate("band_scheduled", subjectContext),
          eventId: event._id,
          debounceKey: scheduledKey,
          idempotencyKey: `${scheduledKey}:${fingerprint}:${Date.now()}`,
          payload: {
            ...base,
            recipientName,
            slotLabel,
            timeRangeLabel,
            isUpdate: await hasSentDebouncedEmail(ctx, scheduledKey),
            otherSlotSummary,
            icsEvent,
            timezone,
          },
        });
        continue;
      }

      await cancelPendingDebouncedEmail(ctx, scheduledKey);
      if (!(await hasSentDebouncedEmail(ctx, scheduledKey))) continue;
      await enqueueDebouncedEmail(ctx, {
        template: "band_unscheduled",
        to: member.email,
        recipientUserId: member.userId,
        subject: subjectForTemplate("band_unscheduled", subjectContext),
        eventId: event._id,
        debounceKey: unscheduledKey,
        idempotencyKey: `${unscheduledKey}:${fingerprint}:${Date.now()}`,
        payload: {
          ...base,
          recipientName,
          slotLabel,
          previousTimeRangeLabel: timeRangeLabel,
          icsEvent,
          timezone,
        },
      });
    }
  }
}
