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
  const event = await ctx.db.get(eventId);
  if (!event) return [];

  const ids = new Set<string>();

  const participations = await ctx.db
    .query("eventBandParticipations")
    .withIndex("by_eventId", (q) => q.eq("eventId", eventId))
    .take(100);
  for (const row of participations) ids.add(row.organizationId);

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
    for (const line of lines) {
      if (!line.organizationId) continue;
      if (
        artistLineAppliesToEvent({
          lineEventId: line.eventId,
          eventId,
          firstLinkedEventId,
          isSeriesBooking,
        })
      ) {
        ids.add(line.organizationId);
      }
    }
  }

  return [...ids];
}
