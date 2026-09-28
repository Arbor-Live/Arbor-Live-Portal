import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { ArtistNeedType } from "./eventArtistNeeds";

/**
 * Series position templates: the shape of a series' bill, applied to each
 * occurrence as an `eventArtistNeeds` row. Times are offsets from the day's
 * start (like `blockTemplates`), so one template fits every occurrence.
 *
 * This module stays free of DB writes and heavy imports so `schema.ts` can
 * import the validator without pulling in the email/participation graph. The
 * executor lives in `eventSeriesGeneration.ts`.
 */

export const eventSeriesPositionTemplateValue = v.object({
  /** Stable id so re-applying updates a position instead of duplicating it. */
  templateKey: v.string(),
  label: v.string(),
  artistType: v.union(v.literal("band"), v.literal("dj"), v.literal("no_preference")),
  genres: v.optional(v.string()),
  /** Day the slot is on, relative to each occurrence's start. */
  dayIndex: v.number(),
  /** Set window, as an offset from the occurrence start. */
  setOffsetMs: v.optional(v.number()),
  setDurationMs: v.optional(v.number()),
  /** Soundcheck window, as an offset from the occurrence start. */
  soundcheckOffsetMs: v.optional(v.number()),
  soundcheckDurationMs: v.optional(v.number()),
});

export type EventSeriesPositionTemplate = {
  templateKey: string;
  label: string;
  artistType: ArtistNeedType;
  genres?: string;
  dayIndex: number;
  setOffsetMs?: number;
  setDurationMs?: number;
  soundcheckOffsetMs?: number;
  soundcheckDurationMs?: number;
};

export type PositionWindow = {
  setStartsAt?: number;
  setEndsAt?: number;
  soundcheckStartsAt?: number;
  soundcheckEndsAt?: number;
};

/** Resolve a template's relative windows into absolute times for one occurrence. */
export function positionWindowFromTemplate(
  template: EventSeriesPositionTemplate,
  occurrenceStartAt: number,
): PositionWindow {
  const setStartsAt =
    template.setOffsetMs !== undefined ? occurrenceStartAt + template.setOffsetMs : undefined;
  const setEndsAt =
    setStartsAt !== undefined && template.setDurationMs !== undefined
      ? setStartsAt + template.setDurationMs
      : undefined;
  const soundcheckStartsAt =
    template.soundcheckOffsetMs !== undefined
      ? occurrenceStartAt + template.soundcheckOffsetMs
      : undefined;
  const soundcheckEndsAt =
    soundcheckStartsAt !== undefined && template.soundcheckDurationMs !== undefined
      ? soundcheckStartsAt + template.soundcheckDurationMs
      : undefined;
  return { setStartsAt, setEndsAt, soundcheckStartsAt, soundcheckEndsAt };
}

export type ExistingPositionSlot = {
  _id: Id<"eventArtistNeeds">;
  /** Absent on positions staff added by hand (not from the template). */
  templateKey?: string;
  /** A platform act fills it, or an outside act is named on it. */
  filled: boolean;
};

export type PositionTemplateAction =
  | { kind: "insert"; template: EventSeriesPositionTemplate }
  | { kind: "update"; template: EventSeriesPositionTemplate; needId: Id<"eventArtistNeeds"> };

export type PositionTemplatePlan = {
  actions: PositionTemplateAction[];
  /** Open template positions whose template is gone. Filled positions are kept. */
  removeIds: Id<"eventArtistNeeds">[];
};

/**
 * Decide what applying `templates` does to an occurrence's existing positions.
 * Re-applying with unchanged templates plans the same updates (never a second
 * insert), and a filled position is never updated or removed.
 */
export function planPositionTemplateApplication(
  existing: readonly ExistingPositionSlot[],
  templates: readonly EventSeriesPositionTemplate[],
): PositionTemplatePlan {
  const byKey = new Map<string, ExistingPositionSlot>();
  for (const slot of existing) {
    if (!slot.templateKey || byKey.has(slot.templateKey)) continue;
    byKey.set(slot.templateKey, slot);
  }

  const actions: PositionTemplateAction[] = [];
  for (const template of templates) {
    const match = byKey.get(template.templateKey);
    if (!match) {
      actions.push({ kind: "insert", template });
      continue;
    }
    if (match.filled) continue;
    actions.push({ kind: "update", template, needId: match._id });
  }

  const wanted = new Set(templates.map((template) => template.templateKey));
  const removeIds = existing
    .filter(
      (slot) =>
        slot.templateKey !== undefined && !wanted.has(slot.templateKey) && !slot.filled,
    )
    .map((slot) => slot._id);
  return { actions, removeIds };
}

/** Capture an occurrence's position as a template, relative to the event start. */
export function positionTemplateFromSlot(
  slot: {
    templateKey?: string;
    label?: string;
    artistType: ArtistNeedType;
    genres?: string;
    setStartsAt?: number;
    setEndsAt?: number;
    soundcheckStartsAt?: number;
    soundcheckEndsAt?: number;
  },
  occurrenceStartAt: number,
  dayIndexFromAnchor: (timeMs: number) => number,
): EventSeriesPositionTemplate {
  const setOffsetMs =
    slot.setStartsAt !== undefined ? slot.setStartsAt - occurrenceStartAt : undefined;
  const setDurationMs =
    slot.setStartsAt !== undefined && slot.setEndsAt !== undefined
      ? slot.setEndsAt - slot.setStartsAt
      : undefined;
  const soundcheckOffsetMs =
    slot.soundcheckStartsAt !== undefined
      ? slot.soundcheckStartsAt - occurrenceStartAt
      : undefined;
  const soundcheckDurationMs =
    slot.soundcheckStartsAt !== undefined && slot.soundcheckEndsAt !== undefined
      ? slot.soundcheckEndsAt - slot.soundcheckStartsAt
      : undefined;
  const anchorTime =
    setOffsetMs !== undefined
      ? slot.setStartsAt!
      : soundcheckOffsetMs !== undefined
        ? slot.soundcheckStartsAt!
        : occurrenceStartAt;
  return {
    templateKey: slot.templateKey ?? `pos_${crypto.randomUUID().replaceAll("-", "")}`,
    label: slot.label?.trim() ?? "",
    artistType: slot.artistType,
    genres: slot.genres?.trim() || undefined,
    dayIndex: dayIndexFromAnchor(anchorTime),
    setOffsetMs,
    setDurationMs,
    soundcheckOffsetMs,
    soundcheckDurationMs,
  };
}
