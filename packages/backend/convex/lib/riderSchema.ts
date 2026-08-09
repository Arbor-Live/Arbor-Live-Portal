import { v } from "convex/values";

/**
 * Validators for band technical riders.
 *
 * These mirror the types in `@arbor/rider-document` — the web editor, the PDF
 * export, and show-file generation all read the same shape, so the two must be
 * kept in step.
 */

export const riderInputTypeValue = v.union(
  v.literal("mic"),
  v.literal("di"),
  v.literal("line"),
  v.literal("wireless"),
  v.literal("playback"),
);

export const riderStandValue = v.union(
  v.literal("none"),
  v.literal("tall_boom"),
  v.literal("short_boom"),
  v.literal("straight"),
  v.literal("clip"),
);

export const riderProvidedByValue = v.union(
  v.literal("band"),
  v.literal("arbor"),
  v.literal("venue"),
  v.literal("unknown"),
);

export const riderMonitorTypeValue = v.union(
  v.literal("wedge"),
  v.literal("iem"),
  v.literal("side_fill"),
);

export const riderStageValue = v.object({
  widthFt: v.number(),
  depthFt: v.number(),
});

export const riderStageItemValue = v.object({
  id: v.string(),
  symbol: v.string(),
  label: v.string(),
  xFt: v.number(),
  yFt: v.number(),
  rotation: v.number(),
  scale: v.number(),
  notes: v.optional(v.string()),
  monitorMixId: v.optional(v.string()),
});

export const riderInputChannelValue = v.object({
  id: v.string(),
  channel: v.number(),
  source: v.string(),
  /**
   * Canonical source key from `@arbor/rider-document`, set by the symbol seeds
   * and by the source picker. Optional: unmapped channels are legitimate and get
   * resolved at generation time. Deliberately not a union of literals — the
   * vocabulary grows, and a new key must not make every existing rider fail
   * validation.
   */
  sourceKey: v.optional(v.string()),
  inputType: riderInputTypeValue,
  micPreference: v.optional(v.string()),
  stand: riderStandValue,
  phantom: v.boolean(),
  providedBy: riderProvidedByValue,
  notes: v.optional(v.string()),
  stageItemId: v.optional(v.string()),
  stereo: v.optional(v.boolean()),
});

export const riderMonitorMixValue = v.object({
  id: v.string(),
  mixNumber: v.number(),
  label: v.string(),
  type: riderMonitorTypeValue,
  sends: v.number(),
  notes: v.optional(v.string()),
});

export const riderBacklineItemValue = v.object({
  id: v.string(),
  label: v.string(),
  quantity: v.number(),
  providedBy: riderProvidedByValue,
  notes: v.optional(v.string()),
});

export const riderStatusValue = v.union(
  v.literal("draft"),
  v.literal("published"),
);

/** Band-authored body of a rider, shared by the table and the update mutation. */
export const riderContentFields = {
  stage: riderStageValue,
  items: v.array(riderStageItemValue),
  inputs: v.array(riderInputChannelValue),
  monitorMixes: v.array(riderMonitorMixValue),
  backline: v.array(riderBacklineItemValue),
  performerCount: v.optional(v.number()),
  setLengthMinutes: v.optional(v.number()),
  powerNotes: v.optional(v.string()),
  generalNotes: v.optional(v.string()),
  hospitalityNotes: v.optional(v.string()),
  contactName: v.optional(v.string()),
  contactEmail: v.optional(v.string()),
  contactPhone: v.optional(v.string()),
};

export const riderContentValue = v.object(riderContentFields);

/** Guard rails so a malformed plot can never break the editor or the PDF. */
export const RIDER_LIMITS = {
  maxItems: 120,
  maxInputs: 96,
  maxMixes: 24,
  maxBackline: 60,
  minStageFt: 8,
  maxStageFt: 80,
  maxNameLength: 80,
  maxNotesLength: 4000,
} as const;
