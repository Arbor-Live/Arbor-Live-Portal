import { v } from "convex/values";

/**
 * Run-of-show block types. `soundcheck` and `set` belong to one act on the bill
 * (see `participationId` / `needId` on `eventScheduleBlocks`); the rest are
 * free-standing blocks staff add on the schedule.
 */
export const SCHEDULE_BLOCK_TYPES = [
  "setup",
  "doors",
  "soundcheck",
  "show",
  "set",
  "changeover",
  "strike",
  "custom",
] as const;

export type ScheduleBlockType = (typeof SCHEDULE_BLOCK_TYPES)[number];

/** Block types owned by an act; their times are edited from the lineup. */
export const ACT_BLOCK_TYPES = ["soundcheck", "set"] as const;
export type ActBlockType = (typeof ACT_BLOCK_TYPES)[number];

export const scheduleBlockTypeValue = v.union(
  v.literal("setup"),
  v.literal("doors"),
  v.literal("soundcheck"),
  v.literal("show"),
  v.literal("set"),
  v.literal("changeover"),
  v.literal("strike"),
  v.literal("custom"),
);

/**
 * Moments happen inside a section (soundchecks during setup, sets during the
 * show). Crew are scheduled per section, never per moment.
 */
export const MOMENT_BLOCK_TYPES = ["doors", "soundcheck", "set", "changeover"] as const;

export function isSectionBlockType(type: ScheduleBlockType) {
  return !(MOMENT_BLOCK_TYPES as readonly string[]).includes(type);
}
