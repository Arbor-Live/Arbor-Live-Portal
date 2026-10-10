import type { ShowDesk, ShowTarget } from "./types";

/**
 * Console colour and icon translation.
 *
 * Windowing the same logic as the scene-converter tools: the WING, X32 and
 * X Air palettes are unrelated, so an index passed straight through lands on
 * the wrong swatch. We go from the WING `col` our `Default.snap` template
 * carries to each target’s own encoding.
 *
 * Sources: the WING palette was read back out of saved snapshots; the X32 and
 * X Air tables are the eight colours those desks expose, with the X Air sharing
 * the X32 hues under palette indexes instead of mnemonics.
 */

export const SHOW_TARGETS: ShowTarget[] = ["wing", "x32", "x32-ms", "xair", "xair-ms"];

export const SHOW_TARGET_LABEL: Record<ShowTarget, string> = {
  wing: "Behringer WING",
  x32: "X32 / M32",
  "x32-ms": "X32 / M32 · Mixing Station",
  xair: "X Air / XR18",
  "xair-ms": "X Air / XR18 · Mixing Station",
};

/** Mixing Station targets build for the same desk as their `.scn` sibling. */
export function showTargetDesk(target: ShowTarget): ShowDesk {
  return target === "x32-ms" ? "x32" : target === "xair-ms" ? "xair" : target;
}

/** WING `col` → X32 colour mnemonic. Several WING colours collapse onto one. */
export const WING_COL_TO_X32: Record<number, string> = {
  1: "BL", 2: "BL", 3: "MG", 4: "CY", 5: "GN", 6: "GN", 7: "YE", 8: "YE",
  9: "RD", 10: "RD", 11: "MG", 12: "MG", 13: "YE", 14: "CY", 15: "RD",
  16: "GN", 17: "OFF", 18: "WH",
};

/** X32 mnemonic → the X Air palette index for the same swatch. */
const X32_CODE_TO_XAIR: Record<string, number> = {
  OFF: 0, RD: 1, GN: 2, YE: 3, BL: 4, MG: 5, CY: 6, WH: 7,
};

export function wingColToX32(wingCol: number | undefined): string {
  return WING_COL_TO_X32[Number(wingCol)] ?? "OFF";
}

export function wingColToXAir(wingCol: number | undefined): number {
  return x32ColorIndex(wingColToX32(wingCol));
}

/** X32 mnemonic → palette index (Mixing Station and the X Air share it). */
export function x32ColorIndex(code: string): number {
  return X32_CODE_TO_XAIR[code] ?? 0;
}

/**
 * WING socket icon → X32 icon. Only pairs observed between the two desks are
 * mapped; anything else falls back to X32 icon 1 (blank) rather than guessing.
 */
const WING_ICON_TO_X32: Record<number, number> = {
  200: 2, 201: 3, 202: 4, 203: 5, 206: 6, 209: 8, 211: 9,
  205: 10, 213: 12, 300: 17, 101: 50, 605: 62,
};

export function wingIconToX32(wingIcon: number | undefined): number {
  return WING_ICON_TO_X32[Number(wingIcon)] ?? 1;
}
