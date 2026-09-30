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
  /** Used to adopt a hand-added position that matches a template by name. */
  label?: string;
  /**
   * Not ours to move or remove: a platform act fills it, an outside act is named
   * on it, or it has inquiries (`status !== "open"`). Applying carries these
   * across untouched.
   */
  locked: boolean;
};

export type PositionTemplateAction =
  | { kind: "insert"; template: EventSeriesPositionTemplate }
  | { kind: "update"; template: EventSeriesPositionTemplate; needId: Id<"eventArtistNeeds"> };

export type PositionTemplatePlan = {
  actions: PositionTemplateAction[];
  /** Open template positions whose template is gone. Filled positions are kept. */
  removeIds: Id<"eventArtistNeeds">[];
  /**
   * Locked positions adopted by a template (matched by name: hand-added, or
   * keyed to a replaced template): only their `templateKey` is stamped so later
   * applies recognize them.
   */
  stampKeys: Array<{ needId: Id<"eventArtistNeeds">; templateKey: string }>;
};

function normalizeLabel(label: string | undefined) {
  return label?.trim().toLowerCase() ?? "";
}

/**
 * Most template positions a series can carry. An occurrence's apply reads its
 * positions with `MAX_OCCURRENCE_POSITIONS`, so the template stays well under
 * it (real bills are a handful of slots).
 */
export const MAX_POSITION_TEMPLATES = 50;
/** Positions read per occurrence when applying or importing. */
export const MAX_OCCURRENCE_POSITIONS = 100;

function isNonNegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0;
}

/**
 * Server-side check of a template set: the mutations can be called directly,
 * so the web editor's validation isn't enough.
 */
export function assertValidPositionTemplates(templates: readonly EventSeriesPositionTemplate[]) {
  if (templates.length > MAX_POSITION_TEMPLATES) {
    throw new Error(
      `A series can have at most ${MAX_POSITION_TEMPLATES} template positions, got ${templates.length}.`,
    );
  }
  assertUniqueTemplateKeys(templates);
  for (const template of templates) {
    const name = template.label.trim();
    if (!name) throw new Error("Give every template position a name.");
    if (!isNonNegativeInteger(template.dayIndex)) {
      throw new Error(`"${name}": day must be a whole number, got ${template.dayIndex}.`);
    }
    for (const [offset, duration, what] of [
      [template.setOffsetMs, template.setDurationMs, "set"],
      [template.soundcheckOffsetMs, template.soundcheckDurationMs, "soundcheck"],
    ] as const) {
      if (offset !== undefined && !Number.isFinite(offset)) {
        throw new Error(`"${name}": ${what} start must be a number, got ${offset}.`);
      }
      if (duration === undefined) continue;
      if (offset === undefined) {
        throw new Error(`"${name}": a ${what} length needs a ${what} start.`);
      }
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error(`"${name}": ${what} length must be more than zero, got ${duration}.`);
      }
    }
  }
}

/** Throws when two templates share a key (each key is one position per occurrence). */
export function assertUniqueTemplateKeys(templates: readonly EventSeriesPositionTemplate[]) {
  const seen = new Set<string>();
  for (const template of templates) {
    if (!template.templateKey.trim()) throw new Error("Every template position needs a key.");
    if (seen.has(template.templateKey)) {
      throw new Error("Template positions must have unique keys.");
    }
    seen.add(template.templateKey);
  }
}

/**
 * Decide what applying `templates` does to an occurrence's existing positions.
 * Re-applying with unchanged templates plans the same updates (never a second
 * insert), and a locked position (filled, named outside act, or inquiring) is
 * never updated or removed.
 *
 * A template with no keyed match adopts a hand-added position with the same
 * name, so applying to an occurrence that was set up by hand does not add a
 * second "Headliner" next to the booked one.
 */
export function planPositionTemplateApplication(
  existing: readonly ExistingPositionSlot[],
  templates: readonly EventSeriesPositionTemplate[],
): PositionTemplatePlan {
  const wanted = new Set(templates.map((template) => template.templateKey));
  const byKey = new Map<string, ExistingPositionSlot>();
  for (const slot of existing) {
    if (!slot.templateKey || !wanted.has(slot.templateKey) || byKey.has(slot.templateKey)) continue;
    byKey.set(slot.templateKey, slot);
  }
  // Positions no current template claims by key: hand-added ones, and ones
  // keyed to a template that was since replaced (e.g. deleted and re-added).
  const unclaimed = existing.filter(
    (slot) => !slot.templateKey || !wanted.has(slot.templateKey),
  );
  const adopted = new Set<Id<"eventArtistNeeds">>();

  const actions: PositionTemplateAction[] = [];
  const stampKeys: PositionTemplatePlan["stampKeys"] = [];
  for (const template of templates) {
    let match = byKey.get(template.templateKey);
    if (!match) {
      const label = normalizeLabel(template.label);
      match = label
        ? unclaimed.find((slot) => !adopted.has(slot._id) && normalizeLabel(slot.label) === label)
        : undefined;
      if (match) adopted.add(match._id);
    }
    if (!match) {
      actions.push({ kind: "insert", template });
      continue;
    }
    if (match.locked) {
      if (match.templateKey !== template.templateKey) {
        stampKeys.push({ needId: match._id, templateKey: template.templateKey });
      }
      continue;
    }
    actions.push({ kind: "update", template, needId: match._id });
  }

  const removeIds = existing
    .filter(
      (slot) =>
        slot.templateKey !== undefined &&
        !wanted.has(slot.templateKey) &&
        !slot.locked &&
        !adopted.has(slot._id),
    )
    .map((slot) => slot._id);
  return { actions, removeIds, stampKeys };
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
