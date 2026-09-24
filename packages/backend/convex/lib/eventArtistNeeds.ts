import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { artistLineAppliesToEvent, isSingleSeriesBooking } from "./invoiceArtistDays";

export const ARTIST_NEED_TYPES = ["band", "dj", "no_preference"] as const;
export type ArtistNeedType = (typeof ARTIST_NEED_TYPES)[number];

export const artistNeedTypeValue = v.union(
  v.literal("band"),
  v.literal("dj"),
  v.literal("no_preference"),
);

export const ARTIST_NEED_TYPE_LABELS: Record<ArtistNeedType, string> = {
  band: "Live band",
  dj: "DJ",
  no_preference: "No preference",
};

/**
 * Stored lifecycle is staff-driven; "booked" is derived (never stored) from a
 * non-TBD invoice artist line or an `eventBandParticipations` row.
 */
export const ARTIST_NEED_STATUSES = ["open", "inquiring"] as const;
export type ArtistNeedStatus = (typeof ARTIST_NEED_STATUSES)[number];

export const artistNeedStatusValue = v.union(v.literal("open"), v.literal("inquiring"));

export type EffectiveArtistNeedStatus = ArtistNeedStatus | "booked";

export const ARTIST_NEED_STATUS_LABELS: Record<EffectiveArtistNeedStatus, string> = {
  open: "Open",
  inquiring: "Inquiring",
  booked: "Booked",
};

export function effectiveArtistNeedStatus(
  status: ArtistNeedStatus,
  booked: boolean,
): EffectiveArtistNeedStatus {
  return booked ? "booked" : status;
}

/** True when `artistType` could satisfy an event looking for `needType`. */
export function artistTypeMatchesNeed(
  needType: ArtistNeedType,
  artistType: string | undefined | null,
): boolean {
  if (needType === "no_preference") return true;
  if (needType === "band") return artistType === "band" || artistType === "singer_songwriter";
  if (needType === "dj") return artistType === "dj";
  return false;
}

/**
 * Organization ids already booked on an event: `eventBandParticipations` rows
 * plus non-TBD `invoiceLineItems` (section "artist") that apply to this day.
 */
export async function resolveEventBookedArtistIds(
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<string[]> {
  const { lineup, invoiceArtistIds } = await resolveEventArtistBooking(ctx, eventId);
  return [...new Set([...lineup.map((row) => row.organizationId), ...invoiceArtistIds])];
}

/** One act on an event's bill. Times are the "run of show" windows. */
export type EventArtistLineupEntry = {
  participationId: Id<"eventBandParticipations">;
  organizationId: string;
  role: "headliner" | "support" | "other";
  /** Slot this act fills, when it was booked against one. */
  needId: Id<"eventArtistNeeds"> | undefined;
  setStartsAt: number | undefined;
  setEndsAt: number | undefined;
  soundcheckStartsAt: number | undefined;
  soundcheckEndsAt: number | undefined;
};

export type EventArtistBooking = {
  lineup: EventArtistLineupEntry[];
  /** Slot ids already filled by a lineup entry. */
  filledSlotIds: Set<Id<"eventArtistNeeds">>;
  /** Non-TBD invoice artist orgs not (yet) on the lineup. */
  invoiceArtistIds: string[];
};

/**
 * Everything booked against an event. Slot fill is explicit — a slot is booked
 * when a `eventBandParticipations` row points at it — so "two bands and a DJ"
 * stays three independently fillable slots. Invoice artist lines are reported
 * separately because a TBD/undetermined line belongs to no particular slot.
 */
export async function resolveEventArtistBooking(
  ctx: QueryCtx,
  eventId: Id<"events">,
): Promise<EventArtistBooking> {
  const event = await ctx.db.get(eventId);
  const lineup: EventArtistLineupEntry[] = [];
  const filledSlotIds = new Set<Id<"eventArtistNeeds">>();
  const invoiceArtistIds: string[] = [];
  if (!event) return { lineup, filledSlotIds, invoiceArtistIds };

  const participations = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(100);
  for (const row of participations) {
    lineup.push({
      participationId: row._id,
      organizationId: row.organizationId,
      role: row.role,
      needId: row.needId,
      setStartsAt: row.setStartsAt,
      setEndsAt: row.setEndsAt,
      soundcheckStartsAt: row.soundcheckStartsAt,
      soundcheckEndsAt: row.soundcheckEndsAt,
    });
    if (row.needId) filledSlotIds.add(row.needId);
  }

  if (event.invoiceId) {
    const linkedEvents = await ctx.db
      .query("events")
      .withIndex("by_invoiceId_and_startAt", (q) => q.eq("invoiceId", event.invoiceId!))
      .take(200);
    const isSeriesBooking = isSingleSeriesBooking(linkedEvents);
    const firstLinkedEventId = linkedEvents[0]?._id;
    const lines = await ctx.db
      .query("invoiceLineItems")
      .withIndex("by_invoiceId_and_section", (q) =>
        q.eq("invoiceId", event.invoiceId!).eq("section", "artist"),
      )
      .take(200);
    const onLineup = new Set(lineup.map((row) => row.organizationId));
    for (const line of lines) {
      if (!line.organizationId) continue;
      if (onLineup.has(line.organizationId)) continue;
      if (
        artistLineAppliesToEvent({
          lineEventId: line.eventId,
          eventId,
          firstLinkedEventId,
          isSeriesBooking,
        })
      ) {
        invoiceArtistIds.push(line.organizationId);
      }
    }
  }

  return { lineup, filledSlotIds, invoiceArtistIds };
}
