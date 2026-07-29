/**
 * Stage plot symbol catalogue.
 *
 * Glyphs are declared as plain data so the browser editor (DOM `<svg>`) and the
 * PDF export (`@react-pdf/renderer` SVG primitives) draw exactly the same
 * picture. Every glyph is authored inside a 0–100 box; renderers scale that box
 * to the item's footprint in feet.
 */

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
  | (ShapeBase & { kind: "path"; d: string })
  | (ShapeBase & {
      kind: "line";
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    });

export type RiderInputSeed = {
  source: string;
  inputType: RiderInputType;
  micPreference?: string;
  stand?: RiderStandType;
  phantom?: boolean;
  providedBy?: RiderProvidedBy;
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
  shapes: RiderGlyphShape[];
  /** Channels appended to the input list when this symbol is placed. */
  defaultInputs?: RiderInputSeed[];
  /** Monitor symbols create (or join) a monitor mix when placed. */
  monitor?: RiderMonitorType;
  hint?: string;
};

export type RiderCategoryPalette = {
  body: string;
  accent: string;
  label: string;
};

/**
 * Plot colours are fixed (not theme-aware): the on-screen canvas is a preview of
 * the printed page, so it stays paper-light in dark mode too.
 */
export const RIDER_CATEGORY_PALETTE: Record<
  RiderSymbolCategory,
  RiderCategoryPalette
> = {
  performer: { body: "#eef2ff", accent: "#4338ca", label: "Performers" },
  backline: { body: "#fff7ed", accent: "#c2410c", label: "Backline" },
  monitor: { body: "#ecfdf5", accent: "#047857", label: "Monitors" },
  input: { body: "#ecfeff", accent: "#0e7490", label: "Mics & DIs" },
  stage: { body: "#f8fafc", accent: "#475569", label: "Stage & power" },
};

export const RIDER_CATEGORY_ORDER: RiderSymbolCategory[] = [
  "performer",
  "backline",
  "monitor",
  "input",
  "stage",
];

// --- glyph builders ------------------------------------------------------

const outline = (extra?: Partial<ShapeBase>): ShapeBase => ({
  fill: "body",
  stroke: "accent",
  strokeWidth: 4,
  ...extra,
});

/** Round performer badge that every performer glyph is drawn inside. */
function performerBadge(...inner: RiderGlyphShape[]): RiderGlyphShape[] {
  return [
    { kind: "circle", cx: 50, cy: 50, r: 46, ...outline() },
    ...inner,
  ];
}

/** Figure-of-eight body plus a neck — reads as a guitar even at legend size. */
function stringInstrument(neckWidth: number): RiderGlyphShape[] {
  return [
    { kind: "circle", cx: 40, cy: 62, r: 16, stroke: "accent", strokeWidth: 5, fill: "none" },
    { kind: "circle", cx: 40, cy: 43, r: 11, stroke: "accent", strokeWidth: 5, fill: "none" },
    { kind: "circle", cx: 40, cy: 56, r: 4, fill: "accent" },
    {
      kind: "line",
      x1: 49,
      y1: 35,
      x2: 76,
      y2: 20,
      stroke: "accent",
      strokeWidth: neckWidth,
    },
    { kind: "circle", cx: 78, cy: 18, r: 5, fill: "accent" },
  ];
}

function micCapsule(
  cx: number,
  top: number,
  height: number,
  width: number,
): RiderGlyphShape {
  return {
    kind: "rect",
    x: cx - width / 2,
    y: top,
    w: width,
    h: height,
    rx: width / 2,
    fill: "accent",
  };
}

function tripodBase(cx: number, y: number, spread: number): RiderGlyphShape[] {
  return [
    {
      kind: "line",
      x1: cx,
      y1: y,
      x2: cx - spread,
      y2: y + 16,
      stroke: "accent",
      strokeWidth: 4,
    },
    {
      kind: "line",
      x1: cx,
      y1: y,
      x2: cx + spread,
      y2: y + 16,
      stroke: "accent",
      strokeWidth: 4,
    },
    {
      kind: "line",
      x1: cx,
      y1: y,
      x2: cx,
      y2: y + 18,
      stroke: "accent",
      strokeWidth: 4,
    },
  ];
}

function speakerCone(cx: number, cy: number, r: number): RiderGlyphShape[] {
  return [
    { kind: "circle", cx, cy, r, stroke: "accent", strokeWidth: 4, fill: "none" },
    { kind: "circle", cx, cy, r: r * 0.34, fill: "accent" },
  ];
}

// --- catalogue -----------------------------------------------------------

const PERFORMER_SYMBOLS: RiderSymbol[] = [
  {
    key: "vocalist",
    label: "Vocalist",
    defaultLabel: "Vocals",
    category: "performer",
    widthFt: 2.6,
    depthFt: 2.6,
    shapes: performerBadge(
      micCapsule(50, 22, 28, 14),
      {
        kind: "path",
        d: "M30 44 A20 20 0 0 0 70 44",
        stroke: "accent",
        strokeWidth: 5,
        fill: "none",
      },
      { kind: "line", x1: 50, y1: 58, x2: 50, y2: 74, stroke: "accent", strokeWidth: 5 },
    ),
    defaultInputs: [
      { source: "Vocal", inputType: "mic", micPreference: "SM58", stand: "tall_boom" },
    ],
    hint: "Adds a vocal channel to the input list.",
  },
  {
    key: "guitarist",
    label: "Guitarist",
    defaultLabel: "Guitar",
    category: "performer",
    widthFt: 2.6,
    depthFt: 2.6,
    shapes: performerBadge(...stringInstrument(5)),
    defaultInputs: [
      { source: "Guitar", inputType: "mic", micPreference: "SM57 on cab", stand: "short_boom" },
    ],
  },
  {
    key: "bassist",
    label: "Bassist",
    defaultLabel: "Bass",
    category: "performer",
    widthFt: 2.6,
    depthFt: 2.6,
    shapes: performerBadge(...stringInstrument(9)),
    defaultInputs: [
      { source: "Bass", inputType: "di", stand: "none", phantom: true },
    ],
  },
  {
    key: "keyboardist",
    label: "Keys player",
    defaultLabel: "Keys",
    category: "performer",
    widthFt: 2.6,
    depthFt: 2.6,
    shapes: performerBadge(
      { kind: "rect", x: 20, y: 38, w: 60, h: 28, rx: 3, ...outline({ strokeWidth: 5 }) },
      { kind: "rect", x: 30, y: 38, w: 6, h: 16, fill: "accent" },
      { kind: "rect", x: 47, y: 38, w: 6, h: 16, fill: "accent" },
      { kind: "rect", x: 64, y: 38, w: 6, h: 16, fill: "accent" },
    ),
    defaultInputs: [
      { source: "Keys L", inputType: "di", stand: "none", phantom: true },
      { source: "Keys R", inputType: "di", stand: "none", phantom: true },
    ],
  },
  {
    key: "drummer",
    label: "Drummer",
    defaultLabel: "Drums",
    category: "performer",
    widthFt: 2.6,
    depthFt: 2.6,
    shapes: performerBadge(
      { kind: "circle", cx: 50, cy: 62, r: 18, fill: "accent" },
      { kind: "circle", cx: 30, cy: 38, r: 11, fill: "accent" },
      { kind: "circle", cx: 70, cy: 38, r: 11, fill: "accent" },
    ),
  },
  {
    key: "hornist",
    label: "Horns",
    defaultLabel: "Horn",
    category: "performer",
    widthFt: 2.6,
    depthFt: 2.6,
    shapes: performerBadge(
      {
        kind: "path",
        d: "M38 22 L38 54 Q38 70 54 70",
        stroke: "accent",
        strokeWidth: 7,
        fill: "none",
      },
      { kind: "polygon", points: "54,58 78,46 78,82 54,70", fill: "accent" },
    ),
    defaultInputs: [
      { source: "Horn", inputType: "mic", micPreference: "SM57 / clip", stand: "tall_boom" },
    ],
  },
  {
    key: "string_player",
    label: "Strings",
    defaultLabel: "Strings",
    category: "performer",
    widthFt: 2.6,
    depthFt: 2.6,
    shapes: performerBadge(
      { kind: "circle", cx: 44, cy: 62, r: 14, stroke: "accent", strokeWidth: 5, fill: "none" },
      { kind: "circle", cx: 44, cy: 46, r: 10, stroke: "accent", strokeWidth: 5, fill: "none" },
      { kind: "line", x1: 52, y1: 38, x2: 76, y2: 22, stroke: "accent", strokeWidth: 5 },
      { kind: "line", x1: 24, y1: 32, x2: 74, y2: 64, stroke: "accent", strokeWidth: 3 },
    ),
    defaultInputs: [
      { source: "Strings", inputType: "di", stand: "none", phantom: true },
    ],
  },
  {
    key: "percussionist",
    label: "Percussion",
    defaultLabel: "Percussion",
    category: "performer",
    widthFt: 2.6,
    depthFt: 2.6,
    shapes: performerBadge(
      { kind: "circle", cx: 36, cy: 56, r: 17, fill: "accent" },
      { kind: "circle", cx: 68, cy: 48, r: 13, fill: "accent" },
    ),
    defaultInputs: [
      { source: "Percussion", inputType: "mic", micPreference: "Condenser overhead", stand: "tall_boom", phantom: true },
    ],
  },
  {
    key: "dj",
    label: "DJ",
    defaultLabel: "DJ",
    category: "performer",
    widthFt: 2.6,
    depthFt: 2.6,
    shapes: performerBadge(
      { kind: "circle", cx: 30, cy: 52, r: 15, ...outline({ strokeWidth: 5 }) },
      { kind: "circle", cx: 70, cy: 52, r: 15, ...outline({ strokeWidth: 5 }) },
      { kind: "circle", cx: 30, cy: 52, r: 4, fill: "accent" },
      { kind: "circle", cx: 70, cy: 52, r: 4, fill: "accent" },
      { kind: "rect", x: 44, y: 40, w: 12, h: 24, rx: 2, fill: "accent" },
    ),
    defaultInputs: [
      { source: "DJ L", inputType: "di", stand: "none", phantom: true },
      { source: "DJ R", inputType: "di", stand: "none", phantom: true },
    ],
  },
  {
    key: "performer",
    label: "Other performer",
    defaultLabel: "Performer",
    category: "performer",
    widthFt: 2.6,
    depthFt: 2.6,
    shapes: performerBadge(
      { kind: "circle", cx: 50, cy: 36, r: 13, fill: "accent" },
      { kind: "path", d: "M26 76 C26 56 74 56 74 76 Z", fill: "accent" },
    ),
  },
];

const BACKLINE_SYMBOLS: RiderSymbol[] = [
  {
    key: "guitar_amp",
    label: "Guitar amp",
    defaultLabel: "Gtr amp",
    category: "backline",
    widthFt: 2.4,
    depthFt: 1.4,
    shapes: [
      { kind: "rect", x: 4, y: 12, w: 92, h: 76, rx: 5, ...outline() },
      ...speakerCone(50, 50, 26),
    ],
    defaultInputs: [
      { source: "Gtr amp", inputType: "mic", micPreference: "SM57", stand: "short_boom" },
    ],
  },
  {
    key: "bass_rig",
    label: "Bass rig",
    defaultLabel: "Bass rig",
    category: "backline",
    widthFt: 2.6,
    depthFt: 1.8,
    shapes: [
      { kind: "rect", x: 4, y: 8, w: 92, h: 84, rx: 5, ...outline() },
      ...speakerCone(30, 52, 20),
      ...speakerCone(70, 52, 20),
    ],
    defaultInputs: [
      { source: "Bass rig", inputType: "di", stand: "none", phantom: true },
    ],
  },
  {
    key: "amp_head",
    label: "Amp head",
    defaultLabel: "Head",
    category: "backline",
    widthFt: 2.2,
    depthFt: 1,
    shapes: [
      { kind: "rect", x: 4, y: 24, w: 92, h: 52, rx: 4, ...outline() },
      { kind: "circle", cx: 28, cy: 50, r: 7, fill: "accent" },
      { kind: "circle", cx: 50, cy: 50, r: 7, fill: "accent" },
      { kind: "circle", cx: 72, cy: 50, r: 7, fill: "accent" },
    ],
  },
  {
    key: "drum_kit",
    label: "Drum kit",
    defaultLabel: "Drum kit",
    category: "backline",
    widthFt: 7,
    depthFt: 6,
    shapes: [
      { kind: "circle", cx: 46, cy: 62, r: 17, ...outline({ strokeWidth: 3 }) },
      { kind: "circle", cx: 46, cy: 62, r: 5, fill: "accent" },
      { kind: "circle", cx: 20, cy: 66, r: 9, ...outline({ strokeWidth: 2.5 }) },
      { kind: "circle", cx: 34, cy: 40, r: 8, ...outline({ strokeWidth: 2.5 }) },
      { kind: "circle", cx: 56, cy: 38, r: 8, ...outline({ strokeWidth: 2.5 }) },
      { kind: "circle", cx: 76, cy: 58, r: 11, ...outline({ strokeWidth: 2.5 }) },
      { kind: "circle", cx: 46, cy: 90, r: 7, stroke: "accent", strokeWidth: 2.5, fill: "none" },
      { kind: "circle", cx: 12, cy: 40, r: 8, stroke: "accent", strokeWidth: 2, fill: "none" },
      { kind: "circle", cx: 30, cy: 16, r: 9, stroke: "accent", strokeWidth: 2, fill: "none" },
      { kind: "circle", cx: 80, cy: 26, r: 10, stroke: "accent", strokeWidth: 2, fill: "none" },
    ],
    defaultInputs: [
      { source: "Kick", inputType: "mic", micPreference: "Beta 52 / D6", stand: "short_boom" },
      { source: "Snare", inputType: "mic", micPreference: "SM57", stand: "short_boom" },
      { source: "Hi-hat", inputType: "mic", micPreference: "Condenser", stand: "short_boom", phantom: true },
      { source: "Overhead L", inputType: "mic", micPreference: "Condenser", stand: "tall_boom", phantom: true },
      { source: "Overhead R", inputType: "mic", micPreference: "Condenser", stand: "tall_boom", phantom: true },
    ],
    hint: "Adds a five-channel drum sub-list.",
  },
  {
    key: "keyboard_rig",
    label: "Keyboard rig",
    defaultLabel: "Keys rig",
    category: "backline",
    widthFt: 4.5,
    depthFt: 1.6,
    shapes: [
      { kind: "rect", x: 2, y: 26, w: 96, h: 48, rx: 3, ...outline() },
      { kind: "line", x1: 18, y1: 26, x2: 18, y2: 54, stroke: "accent", strokeWidth: 3 },
      { kind: "line", x1: 34, y1: 26, x2: 34, y2: 54, stroke: "accent", strokeWidth: 3 },
      { kind: "line", x1: 50, y1: 26, x2: 50, y2: 54, stroke: "accent", strokeWidth: 3 },
      { kind: "line", x1: 66, y1: 26, x2: 66, y2: 54, stroke: "accent", strokeWidth: 3 },
      { kind: "line", x1: 82, y1: 26, x2: 82, y2: 54, stroke: "accent", strokeWidth: 3 },
    ],
    defaultInputs: [
      { source: "Keys L", inputType: "di", stand: "none", phantom: true },
      { source: "Keys R", inputType: "di", stand: "none", phantom: true },
    ],
  },
  {
    key: "dj_booth",
    label: "DJ booth",
    defaultLabel: "DJ booth",
    category: "backline",
    widthFt: 5,
    depthFt: 2.4,
    shapes: [
      { kind: "rect", x: 2, y: 18, w: 96, h: 64, rx: 4, ...outline() },
      { kind: "circle", cx: 24, cy: 50, r: 16, ...outline({ strokeWidth: 3 }) },
      { kind: "circle", cx: 76, cy: 50, r: 16, ...outline({ strokeWidth: 3 }) },
      { kind: "rect", x: 42, y: 30, w: 16, h: 40, rx: 2, fill: "accent" },
    ],
    defaultInputs: [
      { source: "DJ L", inputType: "di", stand: "none", phantom: true },
      { source: "DJ R", inputType: "di", stand: "none", phantom: true },
    ],
  },
  {
    key: "playback",
    label: "Laptop / playback",
    defaultLabel: "Playback",
    category: "backline",
    widthFt: 2,
    depthFt: 1.6,
    shapes: [
      { kind: "rect", x: 20, y: 18, w: 60, h: 42, rx: 3, ...outline() },
      { kind: "polygon", points: "10,78 90,78 80,62 20,62", fill: "accent" },
    ],
    defaultInputs: [
      { source: "Playback L", inputType: "playback", stand: "none" },
      { source: "Playback R", inputType: "playback", stand: "none" },
    ],
  },
];

const MONITOR_SYMBOLS: RiderSymbol[] = [
  {
    key: "wedge",
    label: "Wedge monitor",
    defaultLabel: "Wedge",
    category: "monitor",
    widthFt: 2,
    depthFt: 1.5,
    monitor: "wedge",
    shapes: [
      { kind: "polygon", points: "14,86 86,86 68,20 32,20", ...outline() },
      { kind: "line", x1: 36, y1: 36, x2: 64, y2: 36, stroke: "accent", strokeWidth: 4 },
      { kind: "line", x1: 30, y1: 54, x2: 70, y2: 54, stroke: "accent", strokeWidth: 4 },
      { kind: "line", x1: 24, y1: 72, x2: 76, y2: 72, stroke: "accent", strokeWidth: 4 },
    ],
    hint: "Points at the performer; creates a monitor mix.",
  },
  {
    key: "iem",
    label: "In-ear pack",
    defaultLabel: "IEM",
    category: "monitor",
    widthFt: 1.2,
    depthFt: 1.2,
    monitor: "iem",
    shapes: [
      { kind: "rect", x: 28, y: 24, w: 44, h: 60, rx: 8, ...outline() },
      { kind: "line", x1: 50, y1: 24, x2: 50, y2: 6, stroke: "accent", strokeWidth: 5 },
      { kind: "circle", cx: 50, cy: 6, r: 6, fill: "accent" },
      { kind: "circle", cx: 50, cy: 58, r: 10, fill: "accent" },
    ],
    hint: "Creates an in-ear mix.",
  },
  {
    key: "side_fill",
    label: "Side fill",
    defaultLabel: "Side fill",
    category: "monitor",
    widthFt: 2.6,
    depthFt: 2,
    monitor: "side_fill",
    shapes: [
      { kind: "polygon", points: "18,90 82,90 70,14 30,14", ...outline() },
      ...speakerCone(50, 40, 16),
      { kind: "line", x1: 26, y1: 70, x2: 74, y2: 70, stroke: "accent", strokeWidth: 4 },
    ],
  },
];

const INPUT_SYMBOLS: RiderSymbol[] = [
  {
    key: "vocal_mic",
    label: "Vocal mic",
    defaultLabel: "Vocal mic",
    category: "input",
    widthFt: 1.6,
    depthFt: 1.6,
    shapes: [
      micCapsule(50, 8, 34, 20),
      { kind: "line", x1: 50, y1: 42, x2: 50, y2: 66, stroke: "accent", strokeWidth: 5 },
      ...tripodBase(50, 66, 22),
    ],
    defaultInputs: [
      { source: "Vocal", inputType: "mic", micPreference: "SM58", stand: "tall_boom" },
    ],
  },
  {
    key: "instrument_mic",
    label: "Instrument mic",
    defaultLabel: "Mic",
    category: "input",
    widthFt: 1.4,
    depthFt: 1.4,
    shapes: [
      micCapsule(50, 18, 28, 16),
      { kind: "line", x1: 50, y1: 46, x2: 50, y2: 68, stroke: "accent", strokeWidth: 4 },
      ...tripodBase(50, 68, 18),
    ],
    defaultInputs: [
      { source: "Instrument", inputType: "mic", micPreference: "SM57", stand: "short_boom" },
    ],
  },
  {
    key: "di_box",
    label: "DI box",
    defaultLabel: "DI",
    category: "input",
    widthFt: 1,
    depthFt: 1,
    shapes: [
      { kind: "rect", x: 18, y: 26, w: 64, h: 48, rx: 4, ...outline() },
      { kind: "circle", cx: 34, cy: 50, r: 8, fill: "accent" },
      { kind: "circle", cx: 66, cy: 50, r: 8, fill: "accent" },
      { kind: "line", x1: 18, y1: 62, x2: 82, y2: 62, stroke: "accent", strokeWidth: 3 },
    ],
    defaultInputs: [
      { source: "DI", inputType: "di", stand: "none", phantom: true },
    ],
  },
  {
    key: "mic_stand",
    label: "Bare mic stand",
    defaultLabel: "Stand",
    category: "input",
    widthFt: 1.4,
    depthFt: 1.4,
    shapes: [
      { kind: "line", x1: 50, y1: 22, x2: 50, y2: 68, stroke: "accent", strokeWidth: 5 },
      { kind: "line", x1: 50, y1: 26, x2: 80, y2: 14, stroke: "accent", strokeWidth: 5 },
      ...tripodBase(50, 68, 20),
    ],
  },
];

const STAGE_SYMBOLS: RiderSymbol[] = [
  {
    key: "riser",
    label: "Riser",
    defaultLabel: "Riser 8x8",
    category: "stage",
    widthFt: 8,
    depthFt: 8,
    shapes: [
      { kind: "rect", x: 3, y: 3, w: 94, h: 94, rx: 2, fill: "body", stroke: "accent", strokeWidth: 4, dashed: true },
      { kind: "line", x1: 3, y1: 97, x2: 97, y2: 3, stroke: "accent", strokeWidth: 2 },
    ],
  },
  {
    key: "power_drop",
    label: "Power drop",
    defaultLabel: "Power",
    category: "stage",
    widthFt: 1,
    depthFt: 1,
    shapes: [
      { kind: "circle", cx: 50, cy: 50, r: 42, ...outline() },
      { kind: "rect", x: 36, y: 28, w: 8, h: 22, rx: 3, fill: "accent" },
      { kind: "rect", x: 56, y: 28, w: 8, h: 22, rx: 3, fill: "accent" },
      { kind: "rect", x: 44, y: 58, w: 12, h: 14, rx: 3, fill: "accent" },
    ],
  },
  {
    key: "stool",
    label: "Stool",
    defaultLabel: "Stool",
    category: "stage",
    widthFt: 1.4,
    depthFt: 1.4,
    shapes: [
      { kind: "circle", cx: 50, cy: 50, r: 32, ...outline() },
      { kind: "line", x1: 50, y1: 50, x2: 30, y2: 84, stroke: "accent", strokeWidth: 4 },
      { kind: "line", x1: 50, y1: 50, x2: 70, y2: 84, stroke: "accent", strokeWidth: 4 },
      { kind: "line", x1: 50, y1: 50, x2: 50, y2: 14, stroke: "accent", strokeWidth: 4 },
    ],
  },
  {
    key: "music_stand",
    label: "Music stand",
    defaultLabel: "Music stand",
    category: "stage",
    widthFt: 1.4,
    depthFt: 1.4,
    shapes: [
      { kind: "polygon", points: "18,22 82,32 78,54 14,44", ...outline() },
      { kind: "line", x1: 48, y1: 48, x2: 52, y2: 82, stroke: "accent", strokeWidth: 5 },
      { kind: "line", x1: 34, y1: 88, x2: 70, y2: 88, stroke: "accent", strokeWidth: 4 },
    ],
  },
  {
    key: "table",
    label: "Table",
    defaultLabel: "Table",
    category: "stage",
    widthFt: 4,
    depthFt: 2,
    shapes: [{ kind: "rect", x: 3, y: 16, w: 94, h: 68, rx: 3, ...outline() }],
  },
  {
    key: "note",
    label: "Note / label",
    defaultLabel: "Note",
    category: "stage",
    widthFt: 3,
    depthFt: 1.4,
    shapes: [
      { kind: "rect", x: 3, y: 18, w: 94, h: 64, rx: 5, ...outline() },
      { kind: "line", x1: 16, y1: 40, x2: 84, y2: 40, stroke: "accent", strokeWidth: 4 },
      { kind: "line", x1: 16, y1: 56, x2: 68, y2: 56, stroke: "accent", strokeWidth: 4 },
    ],
    hint: "Free-text callout for anything the plot can't show.",
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

export function riderSymbolsByCategory(
  category: RiderSymbolCategory,
): RiderSymbol[] {
  return RIDER_SYMBOLS.filter((symbol) => symbol.category === category);
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
