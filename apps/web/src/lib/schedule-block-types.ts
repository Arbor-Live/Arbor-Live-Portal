/** Mirrors `SCHEDULE_BLOCK_TYPES` in packages/backend/convex/lib/scheduleBlockTypes.ts. */
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

export const SCHEDULE_BLOCK_TYPE_LABELS: Record<ScheduleBlockType, string> = {
  setup: "Setup",
  doors: "Doors",
  soundcheck: "Soundcheck",
  show: "Show",
  set: "Set",
  changeover: "Changeover",
  strike: "Strike",
  custom: "Custom",
};

/** Types staff pick for a block they add. Soundcheck and set come from the lineup. */
export const MANUAL_SCHEDULE_BLOCK_TYPES: readonly ScheduleBlockType[] = [
  "setup",
  "doors",
  "show",
  "changeover",
  "strike",
  "custom",
];

export function isScheduleBlockType(value: string): value is ScheduleBlockType {
  return (SCHEDULE_BLOCK_TYPES as readonly string[]).includes(value);
}

/**
 * Moments happen inside a section (soundchecks during setup, sets during the
 * show). Crew are scheduled per section, never per moment.
 */
export const MOMENT_BLOCK_TYPES: readonly ScheduleBlockType[] = [
  "doors",
  "soundcheck",
  "set",
  "changeover",
];

export const SECTION_BLOCK_TYPES: readonly ScheduleBlockType[] = ["setup", "show", "strike", "custom"];

export function isSectionBlockType(type: ScheduleBlockType) {
  return !MOMENT_BLOCK_TYPES.includes(type);
}
