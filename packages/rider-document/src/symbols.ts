/**
 * Stage plot symbol catalogue.
 *
 * Glyphs are declared as plain data so the browser editor (DOM `<svg>`) and the
 * PDF export (`@react-pdf/renderer` SVG primitives) draw exactly the same
 * picture. Every glyph is authored inside a 0–100 box; renderers scale that box
 * to the item's footprint in feet.
 */

import { RIDER_GLYPHS, riserGlyph, tableGlyph, type RiderGlyph } from "./glyphs";
import type {
  RiderInputType,
  RiderMonitorType,
  RiderProvidedBy,
  RiderStandType,
} from "./types";

export type RiderSymbolCategory =
  | "performer"
  | "backline"
  | "monitor"
  | "input"
  | "stage";

/** Named paints resolved per category by the renderer. */
export type RiderGlyphPaint = "body" | "accent" | "none";

type ShapeBase = {
  fill?: RiderGlyphPaint;
  stroke?: RiderGlyphPaint;
  strokeWidth?: number;
  dashed?: boolean;
};

export type RiderGlyphShape =
  | (ShapeBase & {
      kind: "rect";
      x: number;
      y: number;
      w: number;
      h: number;
      rx?: number;
    })
  | (ShapeBase & { kind: "circle"; cx: number; cy: number; r: number })
  | (ShapeBase & { kind: "polygon"; points: string })
  | (ShapeBase & {
      kind: "path";
      d: string;
      fillRule?: "nonzero" | "evenodd";
    })
  | (ShapeBase & {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    })
  | {
      kind: "group";
      transform?: string;
      shapes: RiderGlyphShape[];
    };

export type RiderInputSeed = {
  /**
   * Canonical source from the `sources.ts` vocabulary. Omitted on the generic
   * tool symbols (a bare mic or DI box), which deliberately produce an unmapped
   * channel so the band is asked what it actually is.
   */
  sourceKey?: string;
  source: string;
  inputType: RiderInputType;
  micPreference?: string;
  stand?: RiderStandType;
  phantom?: boolean;
  providedBy?: RiderProvidedBy;
  /** Marks a stereo L/R source (one row, two adjacent inputs on the Wing). */
  stereo?: boolean;
};

export type RiderGlyphViewBox = {
  width: number;
  height: number;
};

export type RiderSymbol = {
  key: string;
  /** Palette name. */
  label: string;
  /** Label written onto the plot when the symbol is placed. */
  defaultLabel: string;
  category: RiderSymbolCategory;
  widthFt: number;
  depthFt: number;
  /** Authoring coordinate system when shapes are not in the default 0–100 box. */
  glyphViewBox?: RiderGlyphViewBox;
  /**
   * Letterbox the glyph inside its footprint instead of stretching.
   * Use for circle-heavy icons on non-square stage footprints.
   */
  preserveAspect?: boolean;
  shapes: RiderGlyphShape[];
  /** Channels appended to the input list when this symbol is placed. */
  defaultInputs?: RiderInputSeed[];
  /**
   * The seeds this symbol used before `defaultInputs` last changed. Riders old
   * enough to need `backfillSourceKeys` were made with these, so provenance is
   * resolved against them, never against today's list.
   */
  legacyDefaultInputs?: RiderInputSeed[];
  /** Monitor symbols create (or join) a monitor mix when placed. */
  monitor?: RiderMonitorType;
  hint?: string;
  /** Sized in feet per item (risers, tables) rather than scaled. */
  resizable?: { minFt: number; maxFt: number; stepFt: number };
  /** Still drawn on older plots, but no longer offered in the gear picker. */
  retired?: boolean;
};

export type RiderCategoryPalette = {
  body: string;
  accent: string;
  label: string;
};

/**
 * Paints for the PDF, one hue per family so a crew reads the plot at a glance:
 * performers violet, backline amber, monitors emerald, mics and DIs sky,
 * stage furniture slate. The dashboard uses the same hues as theme tokens
 * (`--rider-*` in globals.css) so the two always match.
 */
export const RIDER_CATEGORY_PALETTE: Record<
  RiderSymbolCategory,
  RiderCategoryPalette
> = {
  performer: { body: "#f5f3ff", accent: "#6d28d9", label: "Performers" },
  backline: { body: "#fffbeb", accent: "#b45309", label: "Backline" },
  monitor: { body: "#ecfdf5", accent: "#047857", label: "Monitors" },
  input: { body: "#f0f9ff", accent: "#0369a1", label: "Mics & DIs" },
  stage: { body: "#f8fafc", accent: "#475569", label: "Stage & power" },
};

export const RIDER_CATEGORY_ORDER: RiderSymbolCategory[] = [
  "performer",
  "backline",
  "monitor",
  "input",
  "stage",
];

// --- catalogue -----------------------------------------------------------

const PERFORMER_SYMBOLS: RiderSymbol[] = [
  {
    key: "vocalist",
    label: "Vocalist",
    defaultLabel: "Vocals",
    category: "performer",
    ...RIDER_GLYPHS.vocalist,
    defaultInputs: [
      {
        sourceKey: "vox.lead",
        source: "Vocal",
        inputType: "wireless",
        micPreference: "Handheld wireless",
        stand: "none",
      },
    ],
    hint: "Adds a vocal channel to the input list.",
  },
  {
    key: "guitarist",
    label: "Guitarist",
    defaultLabel: "Guitar",
    category: "performer",
    ...RIDER_GLYPHS.guitarist,
    defaultInputs: [
      { sourceKey: "gtr", source: "Guitar", inputType: "mic", micPreference: "SM57 on cab", stand: "short_boom" },
    ],
  },
  {
    key: "bassist",
    label: "Bassist",
    defaultLabel: "Bass",
    category: "performer",
    ...RIDER_GLYPHS.bassist,
    defaultInputs: [
      { sourceKey: "bass", source: "Bass", inputType: "di", stand: "none", phantom: true },
    ],
  },
  {
    key: "keyboardist",
    label: "Keys player",
    defaultLabel: "Keys",
    category: "performer",
    ...RIDER_GLYPHS.keyboardist,
    defaultInputs: [
      // One stereo strip, not two mono channels — matches the keyboard_rig
      // symbol and the console's own ST mode.
      { sourceKey: "keys", source: "Keys", inputType: "di", stand: "none", phantom: true, stereo: true },
    ],
  },
  {
    key: "drummer",
    label: "Drummer",
    defaultLabel: "Drums",
    category: "performer",
    ...RIDER_GLYPHS.drummer,
  },
  {
    key: "hornist",
    label: "Horns",
    defaultLabel: "Horn",
    category: "performer",
    ...RIDER_GLYPHS.hornist,
    defaultInputs: [
      { sourceKey: "wind.horn", source: "Horn", inputType: "mic", micPreference: "SM57 / clip", stand: "tall_boom" },
    ],
  },
  {
    key: "string_player",
    label: "Strings",
    defaultLabel: "Strings",
    category: "performer",
    ...RIDER_GLYPHS.string_player,
    defaultInputs: [
      { sourceKey: "strings", source: "Strings", inputType: "di", stand: "none", phantom: true },
    ],
  },
  {
    key: "percussionist",
    label: "Percussion",
    defaultLabel: "Percussion",
    category: "performer",
    ...RIDER_GLYPHS.percussionist,
    defaultInputs: [
      { sourceKey: "perc.aux", source: "Percussion", inputType: "mic", micPreference: "Condenser overhead", stand: "tall_boom", phantom: true },
    ],
  },
  {
    key: "dj",
    label: "DJ",
    defaultLabel: "DJ",
    category: "performer",
    ...RIDER_GLYPHS.dj,
    defaultInputs: [
      { sourceKey: "pb.dj", source: "DJ", inputType: "di", stand: "none", phantom: true, stereo: true },
    ],
  },
  {
    key: "performer",
    label: "Other performer",
    defaultLabel: "Performer",
    category: "performer",
    ...RIDER_GLYPHS.performer,
  },
];

const BACKLINE_SYMBOLS: RiderSymbol[] = [
  {
    key: "guitar_amp",
    label: "Guitar amp",
    defaultLabel: "Gtr amp",
    category: "backline",
    ...RIDER_GLYPHS.guitar_amp,
    defaultInputs: [
      { sourceKey: "gtr", source: "Gtr amp", inputType: "mic", micPreference: "SM57", stand: "short_boom" },
    ],
  },
  {
    key: "bass_rig",
    label: "Bass rig",
    defaultLabel: "Bass rig",
    category: "backline",
    ...RIDER_GLYPHS.bass_rig,
    defaultInputs: [
      { sourceKey: "bass", source: "Bass rig", inputType: "di", stand: "none", phantom: true },
    ],
  },
  {
    key: "amp_head",
    label: "Amp head",
    defaultLabel: "Head",
    category: "backline",
    ...RIDER_GLYPHS.amp_head,
  },
  {
    key: "drum_kit",
    label: "Drum kit",
    defaultLabel: "Drum kit",
    category: "backline",
    ...RIDER_GLYPHS.drum_kit,
    defaultInputs: [
      { sourceKey: "drum.kick", source: "Kick", inputType: "mic", micPreference: "Beta 52 / D6", stand: "short_boom" },
      { sourceKey: "drum.snare.top", source: "Snare", inputType: "mic", micPreference: "Clip-on dynamic", stand: "clip" },
      { sourceKey: "drum.tom.rack", source: "Tom 1", inputType: "mic", micPreference: "Clip-on dynamic", stand: "clip" },
      { sourceKey: "drum.tom.floor", source: "Tom 2", inputType: "mic", micPreference: "Clip-on dynamic", stand: "clip" },
      { sourceKey: "drum.oh", source: "Overheads", inputType: "mic", micPreference: "Condenser", stand: "tall_boom", phantom: true, stereo: true },
    ],
    legacyDefaultInputs: [
      { sourceKey: "drum.kick", source: "Kick", inputType: "mic" },
      { sourceKey: "drum.snare.top", source: "Snare", inputType: "mic" },
      { sourceKey: "drum.hat", source: "Hi-hat", inputType: "mic" },
      { sourceKey: "drum.oh", source: "Overheads", inputType: "mic", stereo: true },
    ],
    hint: "Adds kick, snare, two toms and a stereo pair of overheads.",
  },
  {
    key: "keyboard_rig",
    label: "Keyboard",
    defaultLabel: "Keys",
    category: "backline",
    ...RIDER_GLYPHS.keyboard_rig,
    defaultInputs: [
      { sourceKey: "keys", source: "Keys", inputType: "di", stand: "none", phantom: true, stereo: true },
    ],
  },
  {
    key: "dj_booth",
    label: "DJ booth",
    defaultLabel: "DJ booth",
    category: "backline",
    ...RIDER_GLYPHS.dj_booth,
    defaultInputs: [
      { sourceKey: "pb.dj", source: "DJ", inputType: "di", stand: "none", phantom: true, stereo: true },
    ],
  },
  {
    key: "playback",
    label: "Laptop / playback",
    defaultLabel: "Playback",
    category: "backline",
    ...RIDER_GLYPHS.playback,
    defaultInputs: [
      { sourceKey: "pb", source: "Playback", inputType: "playback", stand: "none", stereo: true },
    ],
  },
];

const MONITOR_SYMBOLS: RiderSymbol[] = [
  {
    key: "wedge",
    label: "Wedge monitor",
    defaultLabel: "Wedge",
    category: "monitor",
    ...RIDER_GLYPHS.wedge,
    monitor: "wedge",
    hint: "Points at the performer; creates a monitor mix.",
  },
  {
    key: "iem",
    label: "In-ear pack",
    defaultLabel: "IEM",
    category: "monitor",
    ...RIDER_GLYPHS.iem,
    monitor: "iem",
    hint: "Creates an in-ear mix.",
  },
];

const INPUT_SYMBOLS: RiderSymbol[] = [
  {
    key: "vocal_mic",
    label: "Wired vocal",
    defaultLabel: "Vocal mic",
    category: "input",
    ...RIDER_GLYPHS.vocal_mic,
    defaultInputs: [
      { sourceKey: "vox.lead", source: "Vocal", inputType: "mic", micPreference: "SM58", stand: "tall_boom" },
    ],
  },
  {
    key: "wireless_mic",
    label: "Wireless handheld",
    defaultLabel: "Wireless mic",
    category: "input",
    ...RIDER_GLYPHS.wireless_mic,
    defaultInputs: [
      {
        sourceKey: "vox.lead", source: "Wireless vocal",
        inputType: "wireless",
        micPreference: "Handheld wireless",
        stand: "none",
      },
    ],
  },
  {
    key: "instrument_mic",
    label: "Instrument mic",
    defaultLabel: "Mic",
    category: "input",
    ...RIDER_GLYPHS.instrument_mic,
    defaultInputs: [
      { source: "Instrument", inputType: "mic", micPreference: "SM57", stand: "short_boom" },
    ],
  },
  {
    key: "di_box",
    label: "DI box",
    defaultLabel: "DI",
    category: "input",
    ...RIDER_GLYPHS.di_box,
    defaultInputs: [
      { source: "DI", inputType: "di", stand: "none", phantom: true },
    ],
  },
  {
    key: "mic_stand",
    label: "Bare mic stand",
    defaultLabel: "Stand",
    category: "input",
    ...RIDER_GLYPHS.mic_stand,
  },
];

const STAGE_SYMBOLS: RiderSymbol[] = [
  {
    key: "riser",
    label: "Riser",
    defaultLabel: "Riser",
    category: "stage",
    ...RIDER_GLYPHS.riser,
    resizable: { minFt: 2, maxFt: 32, stepFt: 1 },
    hint: "Set its width and depth once it's on stage.",
  },
  {
    key: "power_drop",
    label: "Power drop",
    defaultLabel: "Power",
    category: "stage",
    ...RIDER_GLYPHS.power_drop,
  },
  {
    key: "stool",
    label: "Stool",
    defaultLabel: "Stool",
    category: "stage",
    ...RIDER_GLYPHS.stool,
  },
  {
    key: "music_stand",
    label: "Music stand",
    defaultLabel: "Music stand",
    category: "stage",
    ...RIDER_GLYPHS.music_stand,
  },
  {
    key: "table",
    label: "Table",
    defaultLabel: "Table",
    category: "stage",
    ...RIDER_GLYPHS.table,
    resizable: { minFt: 1, maxFt: 16, stepFt: 0.5 },
  },
  {
    key: "note",
    label: "Note / label",
    defaultLabel: "Note",
    category: "stage",
    ...RIDER_GLYPHS.note,
    retired: true,
  },
];

export const RIDER_SYMBOLS: RiderSymbol[] = [
  ...PERFORMER_SYMBOLS,
  ...BACKLINE_SYMBOLS,
  ...MONITOR_SYMBOLS,
  ...INPUT_SYMBOLS,
  ...STAGE_SYMBOLS,
];

const SYMBOLS_BY_KEY = new Map(RIDER_SYMBOLS.map((symbol) => [symbol.key, symbol]));

/** Unknown keys (older riders, hand-edited data) fall back to a neutral note. */
export function riderSymbol(key: string): RiderSymbol {
  return SYMBOLS_BY_KEY.get(key) ?? STAGE_SYMBOLS[STAGE_SYMBOLS.length - 1];
}

/** What the gear picker offers for a family (retired symbols left out). */
export function riderSymbolsByCategory(
  category: RiderSymbolCategory,
): RiderSymbol[] {
  return RIDER_SYMBOLS.filter((symbol) => symbol.category === category && !symbol.retired);
}

/**
 * The artwork for one placed item. Resizable symbols are redrawn at the
 * item's own size, so a 8 × 4 riser keeps even lines instead of stretching.
 */
export function itemGlyph(item: {
  symbol: string;
  widthFt?: number;
  depthFt?: number;
}): Pick<RiderSymbol, "shapes" | "glyphViewBox" | "preserveAspect"> {
  const symbol = riderSymbol(item.symbol);
  if (symbol.resizable && (item.widthFt !== undefined || item.depthFt !== undefined)) {
    const widthFt = item.widthFt ?? symbol.widthFt;
    const depthFt = item.depthFt ?? symbol.depthFt;
    const glyph: RiderGlyph =
      symbol.key === "table" ? tableGlyph(widthFt, depthFt) : riserGlyph(widthFt, depthFt);
    return { shapes: glyph.shapes, glyphViewBox: glyph.glyphViewBox };
  }
  return { shapes: symbol.shapes, glyphViewBox: symbol.glyphViewBox, preserveAspect: symbol.preserveAspect };
}

const ROLE_SYMBOL_HINTS: Array<[RegExp, string]> = [
  [/\b(lead\s*)?(vocal|vox|sing|mc|rapper|front)/i, "vocalist"],
  [/\bbass/i, "bassist"],
  [/\b(guitar|gtr|axe)/i, "guitarist"],
  [/\b(key|piano|synth|organ|rhodes)/i, "keyboardist"],
  [/\b(drum|kit|percussionist)\b/i, "drummer"],
  [/\b(perc|conga|bongo|cajon)/i, "percussionist"],
  [/\b(sax|trumpet|trombone|horn|brass|flute)/i, "hornist"],
  [/\b(violin|viola|cello|strings|fiddle)/i, "string_player"],
  [/\b(dj|turntab|decks|selector)/i, "dj"],
];

/** Best-guess plot symbol for a free-text band role ("Lead guitar" → guitarist). */
export function symbolKeyForRole(role: string | undefined | null): string {
  if (!role) return "performer";
  for (const [pattern, key] of ROLE_SYMBOL_HINTS) {
    if (pattern.test(role)) return key;
  }
  return "performer";
}
