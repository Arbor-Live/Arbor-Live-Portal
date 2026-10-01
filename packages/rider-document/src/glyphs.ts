/**
 * Stage plot artwork: one drawing per symbol, shared by the dashboard canvas
 * and the PDF so the two always match.
 *
 * The language follows the dashboard: a to-scale footprint in a single line
 * weight with square corners and an icon inside. Icons come from Phosphor (the
 * app's icon set) or, for instruments and audio gear Phosphor doesn't draw, are
 * drawn here in its grid and weight. Performers are circles; gear is boxes.
 *
 * Each glyph is authored at `U` units per foot, in a view box the exact size of
 * its footprint, so nothing is stretched and line weights match across symbols.
 */

import { PHOSPHOR_PATHS, type PhosphorIconName } from "./phosphor-paths";
import type { RiderGlyphShape, RiderGlyphViewBox } from "./symbols";

const U = 20;
/** Footprint outline: 0.07 ft. */
const LINE = 1.4;
/** Performers read a touch heavier than gear. */
const PERSON_LINE = 2;
/** Inner detail. */
const DETAIL = 1.1;

export type RiderGlyph = {
  widthFt: number;
  depthFt: number;
  glyphViewBox: RiderGlyphViewBox;
  shapes: RiderGlyphShape[];
};

/**
 * Icons Phosphor doesn't have, in its grid and weight: a 256 box with 16-unit
 * round strokes, so they sit naturally beside the stock icons. Each is a list
 * of stroked paths.
 */
const DRAWN_ICONS = {
  /** Electric bass, upright: offset horns, long neck, four tuners down one side. */
  bass: [
    "M104,148 C104,128 94,112 82,114 C70,116 74,140 70,156 C64,176 52,190 58,212 C64,232 92,244 128,244 C164,244 192,232 198,212 C204,190 192,178 186,160 C180,142 188,122 176,118 C164,114 152,130 152,148 Z",
    "M118,148 L118,46",
    "M138,148 L138,46",
    "M118,46 L114,14 L142,14 L138,46",
    "M114,22 L100,22",
    "M115,32 L101,32",
    "M116,42 L102,42",
    "M104,182 L152,182",
    "M110,214 L146,214",
  ],
  /** Violin from the front, with its bow. */
  violin: [
    "M120,82 C96,82 86,98 90,116 C93,128 102,132 102,144 C102,156 82,162 82,188 C82,216 100,234 120,234 C140,234 158,216 158,188 C158,162 138,156 138,144 C138,132 147,128 150,116 C154,98 144,82 120,82 Z",
    "M120,82 L120,34",
    "M120,34 C120,22 136,22 136,32",
    "M108,190 L132,190",
    "M200,32 L220,232",
  ],
  /** Trumpet: mouthpiece, valves, leadpipe and bell. */
  trumpet: [
    "M20,120 L20,144",
    "M20,132 L60,132",
    "M60,116 L172,116 L228,84 L228,180 L172,148 L60,148 Z",
    "M92,116 L92,80",
    "M118,116 L118,80",
    "M144,116 L144,80",
    "M82,80 L154,80",
    "M76,148 C76,196 172,196 172,148",
  ],
  /** A pair of congas. */
  congas: [
    "M40,96 C32,148 46,200 60,232 L116,232 C130,200 144,148 136,96",
    "M40,96 A48,16 0 1,0 136,96 A48,16 0 1,0 40,96 Z",
    "M140,72 C134,124 146,184 160,232 L208,232 C222,184 234,124 228,72",
    "M140,72 A44,15 0 1,0 228,72 A44,15 0 1,0 140,72 Z",
  ],
  /** A snare and a pair of sticks: the drummer's badge. */
  drum: [
    "M40,120 A88,26 0 1,0 216,120 A88,26 0 1,0 40,120 Z",
    "M40,120 L40,188 A88,26 0 0,0 216,188 L216,120",
    "M84,24 L132,104",
    "M180,20 L136,104",
  ],
  /** The kit everyone draws: kick, two toms, snare, floor tom, hi-hat and crash. */
  drumKit: [
    "M128,124 A52,52 0 1,0 128.1,124 Z",
    "M128,160 A12,12 0 1,0 128.1,160 Z",
    "M86,80 L122,80 L122,112 L86,112 Z",
    "M134,80 L170,80 L170,112 L134,112 Z",
    "M30,150 L78,150 L78,174 L30,174 Z",
    "M40,174 L30,232 M68,174 L78,232",
    "M184,140 L232,140 L232,200 L184,200 Z",
    "M192,200 L190,232 M224,200 L226,232",
    "M14,104 L74,104 M14,116 L74,116 M44,116 L44,150",
    "M178,58 L246,42 M212,50 L212,140",
  ],
  /** Guitar combo: control strip with knobs over one speaker. */
  combo: [
    "M36,40 L220,40 L220,216 L36,216 Z",
    "M36,84 L220,84",
    "M68,62 L68,62.1 M100,62 L100,62.1 M132,62 L132,62.1",
    "M128,104 A46,46 0 1,0 128.1,104 Z",
    "M128,140 A10,10 0 1,0 128.1,140 Z",
  ],
  /** Bass cab: four drivers, the 4×10 everyone asks for. */
  cab: [
    "M36,36 L220,36 L220,220 L36,220 Z",
    "M86,58 A28,28 0 1,0 86.1,58 Z",
    "M170,58 A28,28 0 1,0 170.1,58 Z",
    "M86,142 A28,28 0 1,0 86.1,142 Z",
    "M170,142 A28,28 0 1,0 170.1,142 Z",
  ],
  /** A 57-style instrument mic from the side, on a clamp. */
  instrumentMic: [
    "M56,104 L172,104 L172,144 L56,144 Z",
    "M172,100 L224,108 L224,140 L172,148",
    "M198,104 L198,144",
    "M56,124 L20,124",
    "M114,144 L114,196",
    "M84,196 L144,196 L144,228 L84,228 Z",
  ],
  /** A DI box's face: ¼" jack in, ground-lift switch, XLR out. */
  diBox: [
    "M64,100 A28,28 0 1,0 64.1,100 Z",
    "M64,128 L64,128.1",
    "M128,104 L128,152",
    "M120,104 L136,104",
    "M192,96 A32,32 0 1,0 192.1,96 Z",
    "M180,118 L180,118.1 M204,118 L204,118.1 M192,140 L192,140.1",
  ],
  /** A music stand: angled desk with a page, on a tripod. */
  musicStand: [
    "M48,40 L208,40 L192,128 L64,128 Z",
    "M88,72 L168,72 M92,96 L164,96",
    "M128,128 L128,204",
    "M128,204 L76,236 M128,204 L180,236 M128,204 L128,236",
  ],
} as const;

type DrawnIconName = keyof typeof DRAWN_ICONS;
type IconName = PhosphorIconName | DrawnIconName;

function isDrawn(name: IconName): name is DrawnIconName {
  return name in DRAWN_ICONS;
}

const outline = { fill: "body", stroke: "accent", strokeWidth: LINE } as const;
const detail = { fill: "none", stroke: "accent", strokeWidth: DETAIL } as const;

function frame(widthFt: number, depthFt: number, shapes: RiderGlyphShape[]): RiderGlyph {
  return { widthFt, depthFt, glyphViewBox: { width: widthFt * U, height: depthFt * U }, shapes };
}

function fixed(value: number): number {
  return Number(value.toFixed(4));
}

/** An icon (256 box) centred on `cx, cy` at `size` units. */
function icon(name: IconName, cx: number, cy: number, size: number): RiderGlyphShape {
  const scale = size / 256;
  return {
    kind: "group",
    transform: `translate(${fixed(cx - size / 2)}, ${fixed(cy - size / 2)}) scale(${fixed(scale)})`,
    shapes: isDrawn(name)
      ? DRAWN_ICONS[name].map((d) => ({
          kind: "path" as const,
          d,
          fill: "none" as const,
          stroke: "accent" as const,
          strokeWidth: 16,
        }))
      : PHOSPHOR_PATHS[name].map((d) => ({ kind: "path" as const, d, fill: "accent" as const })),
  };
}

function box(w: number, h: number, extra?: { dashed?: boolean }): RiderGlyphShape {
  return {
    kind: "rect",
    x: LINE / 2,
    y: LINE / 2,
    w: w - LINE,
    h: h - LINE,
    ...outline,
    dashed: extra?.dashed,
  };
}

/** A performer: a circle the size of the space they take, with what they play. */
function person(name: IconName): RiderGlyph {
  const d = 2.6 * U;
  return frame(2.6, 2.6, [
    { kind: "circle", cx: d / 2, cy: d / 2, r: d / 2 - PERSON_LINE / 2, ...outline, strokeWidth: PERSON_LINE },
    icon(name, d / 2, d / 2, d * 0.52),
  ]);
}

/** Small round things on stands: mics, packs, stools. */
function disc(sizeFt: number, name: IconName): RiderGlyph {
  const d = sizeFt * U;
  return frame(sizeFt, sizeFt, [
    { kind: "circle", cx: d / 2, cy: d / 2, r: d / 2 - LINE / 2, ...outline },
    icon(name, d / 2, d / 2, d * 0.6),
  ]);
}

/** Gear in a box: amps, laptops, DIs, the kit. */
function block(
  widthFt: number,
  depthFt: number,
  name: IconName,
  options?: { dashed?: boolean; iconRatio?: number },
): RiderGlyph {
  const w = widthFt * U;
  const h = depthFt * U;
  return frame(widthFt, depthFt, [
    box(w, h, options),
    icon(name, w / 2, h / 2, Math.min(w, h) * (options?.iconRatio ?? 0.6)),
  ]);
}

/** 61-key board from above: a key bed with naturals and sharps. */
function keyboard(): RiderGlyph {
  const w = 4 * U;
  const h = 1.2 * U;
  const left = 4;
  const right = w - 4;
  const bedTop = 8;
  const bottom = h - 3;
  const keyWidth = (right - left) / 14;
  const shapes: RiderGlyphShape[] = [
    box(w, h),
    { kind: "rect", x: left, y: bedTop, w: right - left, h: bottom - bedTop, ...detail },
  ];
  for (let i = 1; i < 14; i++) {
    const x = fixed(left + i * keyWidth);
    shapes.push({ kind: "line", x1: x, y1: bedTop, x2: x, y2: bottom, ...detail });
  }
  // Sharps sit on every natural boundary except E–F and B–C.
  for (let i = 1; i < 14; i++) {
    if (i % 7 === 3 || i % 7 === 0) continue;
    const x = fixed(left + i * keyWidth - keyWidth * 0.3);
    shapes.push({ kind: "rect", x, y: bedTop, w: fixed(keyWidth * 0.6), h: 8, fill: "accent" });
  }
  return frame(4, 1.2, shapes);
}

/** A floor wedge from above: wide cabinet back upstage, angled face, driver. */
function wedge(): RiderGlyph {
  const w = 2 * U;
  const h = 1.1 * U;
  const inset = LINE / 2;
  return frame(2, 1.1, [
    {
      kind: "polygon",
      points: `${inset},${inset} ${w - inset},${inset} ${w - 6},${h - inset} 6,${h - inset}`,
      ...outline,
    },
    { kind: "line", x1: 5, y1: 6, x2: w - 5, y2: 6, ...detail },
    { kind: "circle", cx: w / 2, cy: 13.5, r: 4.5, ...detail },
  ]);
}

/** Two decks and a mixer. */
function djBooth(): RiderGlyph {
  const w = 3.2 * U;
  const h = 2 * U;
  return frame(3.2, 2, [
    box(w, h),
    { kind: "circle", cx: 16, cy: h / 2, r: 10, ...detail },
    { kind: "circle", cx: 16, cy: h / 2, r: 1.8, fill: "accent" },
    { kind: "circle", cx: w - 16, cy: h / 2, r: 10, ...detail },
    { kind: "circle", cx: w - 16, cy: h / 2, r: 1.8, fill: "accent" },
    { kind: "rect", x: w / 2 - 4, y: 9, w: 8, h: h - 18, ...detail },
    { kind: "line", x1: w / 2 - 2, y1: 15, x2: w / 2 + 2, y2: 15, ...detail },
    { kind: "line", x1: w / 2 - 2, y1: 20, x2: w / 2 + 2, y2: 20, ...detail },
    { kind: "line", x1: w / 2 - 2, y1: 25, x2: w / 2 + 2, y2: 25, ...detail },
  ]);
}

/**
 * A platform of any size: dashed edge so whatever stands on it stays the
 * focus, with a hatched corner so it reads as raised.
 */
export function riserGlyph(widthFt: number, depthFt: number): RiderGlyph {
  const w = widthFt * U;
  const h = depthFt * U;
  const marks: RiderGlyphShape[] = [];
  const reach = Math.min(w, h) * 0.22;
  for (let t = 7; t <= reach; t += 7) {
    marks.push({ kind: "line", x1: 3, y1: h - 3 - t, x2: 3 + t, y2: h - 3, ...detail });
  }
  return frame(widthFt, depthFt, [box(w, h, { dashed: true }), ...marks]);
}

/** A table of any size: top with an inset edge. */
export function tableGlyph(widthFt: number, depthFt: number): RiderGlyph {
  const w = widthFt * U;
  const h = depthFt * U;
  return frame(widthFt, depthFt, [box(w, h), { kind: "rect", x: 4, y: 4, w: w - 8, h: h - 8, ...detail }]);
}

/** A bare stand seen from above: three legs and the mast. */
function micStand(): RiderGlyph {
  const d = 1.4 * U;
  const c = d / 2;
  const leg = c - 2;
  const legs = [90, 210, 330].map((degrees) => {
    const radians = (degrees * Math.PI) / 180;
    return {
      kind: "line" as const,
      x1: c,
      y1: c,
      x2: fixed(c + Math.cos(radians) * leg),
      y2: fixed(c + Math.sin(radians) * leg),
      ...detail,
      strokeWidth: LINE,
    };
  });
  return frame(1.4, 1.4, [
    { kind: "circle", cx: c, cy: c, r: c - LINE / 2, fill: "body", stroke: "accent", strokeWidth: DETAIL, dashed: true },
    ...legs,
    { kind: "circle", cx: c, cy: c, r: 2.4, fill: "accent" },
  ]);
}

export const RIDER_GLYPHS = {
  vocalist: person("userSound"),
  guitarist: person("guitar"),
  bassist: person("bass"),
  keyboardist: person("pianoKeys"),
  drummer: person("drum"),
  hornist: person("trumpet"),
  string_player: person("violin"),
  percussionist: person("congas"),
  dj: person("vinylRecord"),
  performer: person("user"),
  guitar_amp: block(2.2, 2.2, "combo"),
  bass_rig: block(2.4, 2.4, "cab"),
  amp_head: block(2.4, 1.4, "faders"),
  drum_kit: block(6, 5, "drumKit", { iconRatio: 0.62 }),
  keyboard_rig: keyboard(),
  dj_booth: djBooth(),
  playback: block(2, 1.6, "laptop"),
  wedge: wedge(),
  iem: disc(1.2, "headphones"),
  vocal_mic: disc(1.6, "microphoneStage"),
  wireless_mic: disc(1.6, "broadcast"),
  instrument_mic: disc(1.6, "instrumentMic"),
  di_box: block(1.4, 1, "diBox", { iconRatio: 0.92 }),
  mic_stand: micStand(),
  riser: riserGlyph(8, 8),
  power_drop: block(1, 1, "lightning"),
  stool: disc(1.4, "stool"),
  music_stand: block(1.6, 1.4, "musicStand", { iconRatio: 0.7 }),
  table: tableGlyph(4, 2),
  note: block(2.4, 2, "textT", { dashed: true }),
} satisfies Record<string, RiderGlyph>;

export type RiderGlyphKey = keyof typeof RIDER_GLYPHS;
