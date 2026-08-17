/**
 * Fixed AES50 A / SD16 / XR18 port layout from Arbor’s Default.snap.
 *
 * Vox always leads (1–4). Drums always trail (11–16). Mid is guitar / bass /
 * flex / keys. Stereo pairs: Keys 9–10 (breakable), OH 15–16 (always ST).
 */

import type { SlotFamily, SnakeGroup, SnakeId } from "./types";

export type TemplateSlot = {
  port: number;
  family: SlotFamily;
  defaultLabel: string;
  stereo: boolean;
  /**
   * Channel strip index (1-based) that patches from this AES50 port.
   * Null for the right half of a stereo pair (no dedicated strip).
   */
  strip: number | null;
  /** Faceplate region for grouping in the UI. */
  region: "vox" | "mid" | "drums";
};

export const TEMPLATE_SLOTS: TemplateSlot[] = [
  { port: 1, family: "vox", defaultLabel: "Vox 1", stereo: false, strip: 1, region: "vox" },
  { port: 2, family: "vox", defaultLabel: "Vox 2", stereo: false, strip: 2, region: "vox" },
  { port: 3, family: "vox", defaultLabel: "Vox 3", stereo: false, strip: 3, region: "vox" },
  { port: 4, family: "vox", defaultLabel: "Vox 4", stereo: false, strip: 4, region: "vox" },
  { port: 5, family: "guitar", defaultLabel: "Guitar", stereo: false, strip: 5, region: "mid" },
  { port: 6, family: "bass", defaultLabel: "Bass", stereo: false, strip: 6, region: "mid" },
  { port: 7, family: "flex", defaultLabel: "Flex1", stereo: false, strip: 7, region: "mid" },
  { port: 8, family: "flex", defaultLabel: "Flex2", stereo: false, strip: 8, region: "mid" },
  { port: 9, family: "keys", defaultLabel: "Keys", stereo: true, strip: 9, region: "mid" },
  { port: 10, family: "keys", defaultLabel: "Keys", stereo: true, strip: null, region: "mid" },
  { port: 11, family: "kick", defaultLabel: "Kick", stereo: false, strip: 10, region: "drums" },
  { port: 12, family: "snare", defaultLabel: "Snare", stereo: false, strip: 11, region: "drums" },
  { port: 13, family: "tom", defaultLabel: "Rack Tom", stereo: false, strip: 12, region: "drums" },
  { port: 14, family: "tom", defaultLabel: "Floor Tom", stereo: false, strip: 13, region: "drums" },
  { port: 15, family: "oh", defaultLabel: "OH 48V", stereo: true, strip: 14, region: "drums" },
  { port: 16, family: "oh", defaultLabel: "OH 48V", stereo: true, strip: null, region: "drums" },
];

export const PORT_BY_NUMBER = new Map(TEMPLATE_SLOTS.map((slot) => [slot.port, slot]));

/** Mono mid overflow order when flex is full (never steal vox/drums first). */
export const MID_OVERFLOW_PORTS = [7, 8, 5, 6, 9, 10] as const;

/** Both stage boxes run the same Default.snap layout, one AES50 group each. */
export const SNAKE_IDS: SnakeId[] = ["A", "B"];

export const SNAKE_LABEL: Record<SnakeId, string> = {
  A: "Snake A · AES50 A",
  B: "Snake B · AES50 B",
};

export const SNAKE_SHORT_LABEL: Record<SnakeId, string> = {
  A: "Snake A",
  B: "Snake B",
};

/**
 * Console strips each box lands on. A keeps Default.snap's 1–14 (a stereo pair
 * shares one strip); `spare` is the extra strip used when a stereo pair breaks
 * and its right-hand socket becomes a mono of its own.
 */
export const SNAKE_STRIPS: Record<SnakeId, { offset: number; spare: number }> = {
  A: { offset: 0, spare: 15 },
  B: { offset: 16, spare: 31 },
};

export function stripFor(snake: SnakeId, slot: TemplateSlot): number | null {
  return slot.strip === null ? null : slot.strip + SNAKE_STRIPS[snake].offset;
}

export function aes50Label(snake: SnakeId, port: number): string {
  return `${snake}.${port}`;
}

/** Drums move between boxes as one block — nobody splits a kit across snakes. */
export function snakeGroupForFamily(family: SlotFamily): SnakeGroup {
  switch (family) {
    case "vox":
    case "guitar":
    case "bass":
    case "flex":
    case "keys":
      return family;
    default:
      return "drums";
  }
}

export const SNAKE_GROUPS: SnakeGroup[] = [
  "vox",
  "guitar",
  "bass",
  "flex",
  "keys",
  "drums",
];

export const SNAKE_GROUP_LABEL: Record<SnakeGroup, string> = {
  vox: "Vox",
  guitar: "Guitar",
  bass: "Bass",
  flex: "Flex / horns / perc",
  keys: "Keys",
  drums: "Drums",
};
