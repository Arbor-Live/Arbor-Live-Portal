/**
 * Stage-box / snap geometry.
 *
 * Every socket owns a channel strip: box socket 1 → strip 1, … 16 → 16, and on
 * the daisy-chained second box 17 → 17, … 32 → 32. That is the whole story — a
 * stereo pair is two sockets sharing one strip (the left/odd socket's), and
 * there is no "socket with no strip" special case to work around.
 *
 * The template's Default.snap input names are just a starting hint; the
 * allocator rewrites the input patch and channel list from the rider with this
 * same geometry.
 */

import type { SlotFamily, SnakeGroup, SnakeId } from "./types";

/** Every socket on the shared AES50 A link, box-relative ports 1–16 per box. */
export const BOX_CAPACITY = 16;

/**
 * Both stage boxes are **daisy-chained** on AES50 A: box A is A.1–16, box B is
 * A.17–32. `SnakeId` names the physical box, never an AES50 group.
 */
export const SNAKE_IDS: SnakeId[] = ["A", "B"];

/** The one AES50 link both boxes hang off. */
export const AES50_GROUP = "A";

/** Where each box starts on the shared link. */
export const SNAKE_PORT_OFFSET: Record<SnakeId, number> = { A: 0, B: 16 };

export const SNAKE_LABEL: Record<SnakeId, string> = {
  A: "Snake A · A.1–16",
  B: "Snake B · A.17–32 (daisy-chained)",
};

export const SNAKE_SHORT_LABEL: Record<SnakeId, string> = {
  A: "Snake A",
  B: "Snake B",
};

/**
 * Rig furniture that is not band content. Talkback lives on console strip 40,
 * always patched from the desk's local input 24, and `cfg.talk.assign` keeps
 * pointing at strip 40. It never touches the stage boxes, so the allocator does
 * not reserve any socket for it.
 */
export const TALKBACK_STRIP = "40";
export const TALKBACK_LOCAL_INPUT = 24;

/**
 * USB 1/2 walk-in music lands on **AUX 1** — the template already feeds that
 * input from source `USB 1/2`, and `clink` pairs it with AUX 2 for stereo. AUX
 * inputs are console channels 41–48, so AUX 1 is channel 41: the index a surface
 * fader points at. Named so the reserved USER1 fader reads as music.
 */
export const USB_MUSIC_AUX = "1";
export const USB_MUSIC_CHANNEL = 41;
export const USB_MUSIC_SOURCE = 1;

/** Box-relative port (1–16) → socket number on the shared AES50 A link. */
export function aes50PortFor(snake: SnakeId, port: number): number {
  return port + SNAKE_PORT_OFFSET[snake];
}

export function aes50Label(snake: SnakeId, port: number): string {
  return `${AES50_GROUP}.${aes50PortFor(snake, port)}`;
}

/** Console strip a socket lands on: socket N → strip N, both boxes. */
export function stripFor(snake: SnakeId, port: number): number {
  return aes50PortFor(snake, port);
}

/**
 * How a port reads at the stage box: the number printed on the SD16, with the
 * socket the desk sees in brackets when the box sits down the chain —
 * "7 (23)" is port 7 on the second snake, A.23 at the console.
 */
export function portLabel(snake: SnakeId, port: number): string {
  const socket = aes50PortFor(snake, port);
  return socket === port ? String(port) : `${port} (${socket})`;
}

/**
 * Keyboard/desk groups for DCA tags and the snake-split UI. Families roll up
 * one-to-one with the template's DCA groups: Vox, Drums, Keys, and the melodic
 * rest. This never decides placement — it only names groups.
 */
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

// DCA grouping and per-channel tags live in `groups.ts` — they are derived from
// the sources actually on the bill, not from a fixed family table.

/**
 * WING colour + icon per family, so a channel keeps its colour wherever it
 * lands. The blueprint's colours are positional (socket 1 is vox, 11 is kick),
 * which is wrong once we pack by family — a Kick can sit on strip 4. These are
 * the same swatches the blueprint uses for each family, applied by family.
 *
 * Colours are WING palette indexes; the X32/X Air translation reads them
 * (`palette.ts`). Icons are the WING's own instrument glyphs.
 */
export const FAMILY_STYLE: Record<
  SlotFamily,
  { col: number; icon: number }
> = {
  vox: { col: 14, icon: 101 },
  guitar: { col: 9, icon: 306 },
  bass: { col: 9, icon: 300 },
  keys: { col: 5, icon: 402 },
  flex: { col: 7, icon: 103 },
  kick: { col: 11, icon: 200 },
  snare: { col: 11, icon: 202 },
  tom: { col: 11, icon: 210 },
  oh: { col: 11, icon: 205 },
};
