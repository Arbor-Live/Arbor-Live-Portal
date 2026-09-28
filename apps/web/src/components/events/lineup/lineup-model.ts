import type { useQuery } from "convex/react";
import type { api } from "@/lib/convex-api";
import type { PerformerRow } from "@/components/events/lineup/lineup-forms";

export type ArtistNeedType = "band" | "dj" | "no_preference";
export type ArtistNeedStatus = "open" | "inquiring";
export type EffectiveArtistNeedStatus = ArtistNeedStatus | "booked";

type BillData = NonNullable<ReturnType<typeof useQuery<typeof api.eventArtistNeeds.getForEvent>>>;
export type SlotRow = BillData["slots"][number];

export type RiderRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.bandRiders.listForEvent>>
>[number];

/**
 * One row on the bill: a position, with the act that fills it if any. Acts
 * without a position (possible only for rows the migration hasn't reached) get
 * a row of their own so nothing disappears.
 */
export type BillRow = {
  key: string;
  slot?: SlotRow;
  performer?: PerformerRow;
};

export const TYPE_OPTIONS = [
  { value: "band", label: "Live band" },
  { value: "dj", label: "DJ" },
  { value: "no_preference", label: "No preference" },
];

export const SLOT_STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "inquiring", label: "Inquiring" },
];

export const TYPE_LABELS: Record<ArtistNeedType, string> = {
  band: "Live band",
  dj: "DJ",
  no_preference: "No preference",
};

export function effectiveStatusLabel(status: EffectiveArtistNeedStatus) {
  if (status === "booked") return "Booked";
  if (status === "inquiring") return "Inquiring";
  return "Open";
}

export function effectiveStatusClass(status: EffectiveArtistNeedStatus) {
  switch (status) {
    case "booked":
      return "bg-status-emerald-500/15 text-status-emerald-800 dark:text-status-emerald-200";
    case "inquiring":
      return "bg-status-amber-500/15 text-status-amber-800 dark:text-status-amber-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function slotTitle(slot: { label: string; artistType: ArtistNeedType }) {
  return slot.label.trim() || TYPE_LABELS[slot.artistType];
}

export function rowStatus(row: BillRow): EffectiveArtistNeedStatus {
  return row.slot ? row.slot.effectiveStatus : "booked";
}

/** What fills the row: a platform act, an outside act's name, or nothing yet. */
export function rowActName(row: BillRow) {
  if (row.performer) return row.performer.bandName;
  const external = row.slot?.externalArtistName.trim();
  return external || null;
}

/** Set window shown on the bill: the act's own, or an outside act's on the slot. */
export function rowSetWindow(row: BillRow): [number | null, number | null] {
  if (row.performer) return [row.performer.setStartsAt, row.performer.setEndsAt];
  if (row.slot) return [row.slot.setStartsAt, row.slot.setEndsAt];
  return [null, null];
}

/** Soundcheck window: the act's own, or the position's when no platform act fills it. */
export function rowSoundcheckWindow(row: BillRow): [number | null, number | null] {
  if (row.performer) return [row.performer.soundcheckStartsAt, row.performer.soundcheckEndsAt];
  if (row.slot) return [row.slot.soundcheckStartsAt, row.slot.soundcheckEndsAt];
  return [null, null];
}

/** Times saved from the side panel; a field left out keeps its current value. */
export type ActTimesPatch = {
  setStartsAt?: number | null;
  setEndsAt?: number | null;
  soundcheckStartsAt?: number | null;
  soundcheckEndsAt?: number | null;
};

export type SlotDraft = {
  label: string;
  /** Empty means "unset" — saved as `no_preference`. */
  artistType: ArtistNeedType | "";
  genres: string;
  /** Empty means "unset" — saved as `open`. */
  status: ArtistNeedStatus | "";
};

export function toSlotDraft(slot: SlotRow): SlotDraft {
  return {
    label: slot.label,
    artistType: slot.artistType,
    genres: slot.genres,
    status: slot.status,
  };
}

export function slotDraftsEqual(a: SlotDraft, b: SlotDraft) {
  return (
    a.label === b.label &&
    a.artistType === b.artistType &&
    a.genres === b.genres &&
    a.status === b.status
  );
}
