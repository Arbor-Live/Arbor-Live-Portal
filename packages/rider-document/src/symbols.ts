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
  source: string;
  inputType: RiderInputType;
  micPreference?: string;
  stand?: RiderStandType;
  phantom?: boolean;
  providedBy?: RiderProvidedBy;
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
    { kind: "circle", cx: 50, cy: 50, r: 44, ...outline({ strokeWidth: 5 }) },
    ...inner,
  ];
}

/**
 * Circle badge around an imported SVG. Keeps native path coords via a nested
 * group transform into the standard 0–100 badge box.
 */
function badgedImportedGlyph(
  sourceViewBox: { width: number; height: number },
  inner: RiderGlyphShape[],
  inset = 20,
): RiderGlyphShape[] {
  const iconBox = 100 - inset * 2;
  const scale = Math.min(iconBox / sourceViewBox.width, iconBox / sourceViewBox.height);
  const ox = (100 - sourceViewBox.width * scale) / 2;
  const oy = (100 - sourceViewBox.height * scale) / 2;
  const scaleStr = Number(scale.toFixed(5));
  const oxStr = Number(ox.toFixed(3));
  const oyStr = Number(oy.toFixed(3));
  return [
    { kind: "circle", cx: 50, cy: 50, r: 44, ...outline({ strokeWidth: 5 }) },
    {
      kind: "group",
      transform: `translate(${oxStr}, ${oyStr}) scale(${scaleStr})`,
      shapes: inner,
    },
  ];
}

/** Linked SVG viewBoxes — shapes keep native coordinates. */
const GUITAR_VIEWBOX = { width: 32, height: 32 } as const;
const BASS_VIEWBOX = { width: 24, height: 24 } as const;
const WIRED_VOCAL_VIEWBOX = { width: 512, height: 512 } as const;
const WIRELESS_MIC_VIEWBOX = { width: 60, height: 371 } as const;
const INSTRUMENT_MIC_VIEWBOX = { width: 495, height: 2835 } as const;
const KEYBOARD_VIEWBOX = { width: 800, height: 240 } as const;

function tallFootprint(
  viewBox: { width: number; height: number },
  depthFt: number,
): { widthFt: number; depthFt: number } {
  return {
    widthFt: (depthFt * viewBox.width) / viewBox.height,
    depthFt,
  };
}

/** Exact SVG Repo guitar (viewBox 0 0 32 32), stroke-only. */
function guitarGlyph(): RiderGlyphShape[] {
  const stroke = { fill: "none" as const, stroke: "accent" as const, strokeWidth: 2 };
  return [
    {
      kind: "path",
      d: "M12.5 21.4 L11 19.9 L22.4 8.5",
      ...stroke,
    },
    {
      kind: "polygon",
      points: "25.4,10 22.4,10 22.4,7 26.2,3.2 29.2,6.2",
      ...stroke,
    },
    {
      kind: "path",
      d:
        "M19.3,11.6c-2.2-1.5-5.1-1.3-6.9,0.5c-0.4,0.4-0.8,1-1,1.5c-0.4,0.9-1.3,1.5-2.2,1.6" +
        "c-0.9,0.1-1.9,0.2-2.7,0.6c-4,2.1-4.1,7.5-0.7,10.9c3.4,3.4,8.8,3.3,10.9-0.7" +
        "c0.4-0.8,0.5-1.8,0.6-2.7c0.1-0.9,0.7-1.8,1.6-2.2c0.2-0.1,0.7-0.3,1.1-0.4" +
        "c0.8-0.2,1.4-0.9,1.7-1.6v0c0.2-0.6,0-1.3-0.6-1.6l-1.6-0.9",
      ...stroke,
    },
    { kind: "line", x1: 8, y1: 21.4, x2: 11, y2: 24.4, ...stroke },
  ];
}

/** Exact SVG Repo bass (viewBox 0 0 24 24). */
function bassGlyph(): RiderGlyphShape[] {
  return [
    {
      kind: "path",
      fillRule: "evenodd",
      fill: "accent",
      d:
        "M23.4472 2.3944C23.9242 2.15593 24.1301 1.58518 23.9153 1.09713C23.7005 0.609073 23.1405 0.375428 22.6425 0.56607L19.8928 1.6187C19.608 1.72775 18.9672 1.99921 18.6912 2.68384C18.5231 3.10071 18.4968 3.56242 18.6133 3.99405L15.7344 6.68451C15.6728 6.39913 15.576 6.11448 15.4398 5.83417C14.7718 4.45946 13.1758 3.87733 11.7211 4.0467C10.1921 4.22474 8.65936 5.21488 7.85421 7.13944C7.84561 7.16 7.8377 7.18083 7.83049 7.20192C7.34308 8.6278 6.2307 9.39943 4.65121 9.63989C1.87867 10.062 -0.120942 12.5729 0.106341 15.3656C0.480446 19.9624 4.09479 23.5767 8.69154 23.9508C11.4842 24.1781 13.9952 22.1785 14.4173 19.4059C14.5483 18.5452 14.7855 17.7716 15.1578 17.211C15.5071 16.6851 15.9663 16.3511 16.6447 16.274C18.2609 16.0904 19.2642 15.1161 19.5137 13.9241C19.7384 12.8509 19.3077 11.5446 18.1347 11.0517C17.0726 10.6054 16.1949 10.9874 15.6921 11.2062L15.6919 11.2063C15.6624 11.2191 15.6342 11.2314 15.6074 11.2429C15.0942 11.4627 14.9405 11.4905 14.6709 11.3546C14.3976 11.2168 14.3143 11.0492 14.2952 10.9629C14.2804 10.8955 14.283 10.7964 14.3964 10.6722L19.9023 5.52684C20.5167 5.8123 21.2696 5.70161 21.7765 5.19478C22.2175 4.75369 22.5251 4.19699 22.6636 3.58878L22.87 2.68301L23.4472 2.3944ZM12.9894 9.24994C12.9713 9.26758 12.9539 9.28574 12.9373 9.30438C12.3951 9.88713 12.1782 10.6492 12.3421 11.3932C12.5093 12.152 13.0436 12.7741 13.7707 13.1406C14.9115 13.7155 15.8386 13.3196 16.3949 13.0813C16.9794 12.8309 17.1196 12.7945 17.36 12.8955C17.4396 12.929 17.6353 13.1359 17.5561 13.5143C17.5017 13.7741 17.2709 14.19 16.4189 14.2868C15.0668 14.4404 14.1158 15.165 13.4918 16.1045C12.8909 17.0092 12.5919 18.1078 12.44 19.1049C12.1749 20.8465 10.5921 22.0989 8.85377 21.9574C5.23355 21.6628 2.39438 18.8236 2.09975 15.2034C1.95828 13.4651 3.21068 11.8823 4.95223 11.6171C7.07768 11.2935 8.92196 10.149 9.71104 7.88343C10.2416 6.63975 11.1537 6.12628 11.9524 6.03328C12.8314 5.93094 13.4503 6.31595 13.6409 6.70824C14.003 7.45347 13.7956 8.44372 13.0038 9.23545C12.999 9.24027 12.9942 9.2451 12.9894 9.24994ZM9.20712 12.7929C8.81659 12.4023 8.18343 12.4023 7.7929 12.7929C7.40238 13.1834 7.40238 13.8166 7.7929 14.2071L9.2929 15.7071C9.68343 16.0976 10.3166 16.0976 10.7071 15.7071C11.0976 15.3166 11.0976 14.6834 10.7071 14.2929L9.20712 12.7929ZM9.70712 17.2929L8.20712 15.7929C7.81659 15.4023 7.18343 15.4023 6.7929 15.7929C6.40238 16.1834 6.40238 16.8166 6.7929 17.2071L8.2929 18.7071C8.68343 19.0976 9.31659 19.0976 9.70712 18.7071C10.0976 18.3166 10.0976 17.6834 9.70712 17.2929Z",
    },
  ];
}

/** Exact wired vocal / SM58-style mic (viewBox 0 0 512 512). */
function wiredVocalMic(): RiderGlyphShape[] {
  return [
    {
      kind: "path",
      fill: "accent",
      d:
        "M225.474,417.434c-14.997-0.018-30.099,5.766-41.536,17.183l-36.285,36.314" +
        "c-9.032,9.012-20.744,13.46-32.581,13.479c-11.838-0.02-23.542-4.467-32.582-13.479" +
        "c-9.02-9.04-13.479-20.754-13.488-32.601c0.009-11.827,4.468-23.541,13.488-32.581" +
        "l-19.493-19.493c-14.357,14.348-21.584,33.278-21.574,52.074c-0.02,18.806,7.217,37.737,21.574,52.094" +
        "C77.345,504.763,96.265,512,115.072,512c18.806,0,37.736-7.237,52.084-21.575l36.285-36.304" +
        "c6.12-6.101,14.014-9.098,22.033-9.126c8.019,0.028,15.913,3.025,22.023,9.135" +
        "c6.464,6.464,9.451,14.921,9.108,23.388l27.55,1.194c0.707-15.828-5.06-32-17.145-44.075" +
        "C255.573,423.201,240.451,417.416,225.474,417.434z",
    },
    {
      kind: "path",
      fill: "accent",
      d:
        "M439.548,31.022c-39.12-39.12-101.219-41.23-142.859-6.396l149.255,149.265" +
        "C480.788,132.251,478.677,70.143,439.548,31.022z",
    },
    {
      kind: "path",
      fill: "accent",
      d:
        "M256.48,100.939L369.65,214.1c22.701-1.584,44.982-10.462,63.063-26.614L283.104,37.867" +
        "C266.943,55.939,258.075,78.22,256.48,100.939z",
    },
    {
      kind: "path",
      fill: "accent",
      d:
        "M51.637,347.47l71.472,71.472l222.494-201.578l-92.379-92.388L51.637,347.47z" +
        " M274.723,210.482l-29.25,29.26l-14.625-14.644l29.25-29.23L274.723,210.482z",
    },
  ];
}

/** Exact wireless handheld (viewBox 0 0 60 371). */
function wirelessHandheldMic(): RiderGlyphShape[] {
  return [
    {
      kind: "path",
      d: "M0 81H60V322H20C8.9543 322 0 313.046 0 302L0 81Z",
      fill: "accent",
    },
    {
      kind: "path",
      d: "M30 2C45.464 2 58 14.536 58 30V79H2L2 30L2.00879 29.2773C2.39209 14.1474 14.7776 2 30 2Z",
      fill: "none",
      stroke: "accent",
      strokeWidth: 4,
    },
    { kind: "rect", x: 0, y: 46, w: 60, h: 6.3938, fill: "accent" },
    {
      kind: "path",
      d: "M36 322H60V361C60 366.523 55.5228 371 50 371H46C40.4772 371 36 366.523 36 361V322Z",
      fill: "accent",
    },
  ];
}

/** Exact instrument / condenser capsule mic (viewBox 0 0 495 2835). */
function instrumentMic(): RiderGlyphShape[] {
  return [
    {
      kind: "path",
      fill: "accent",
      d:
        "M21.9805 440H473.02C484.809 440 494.041 429.854 492.931 418.117L456.713 35.1171" +
        "C455.742 24.8467 447.118 17 436.802 17H58.198C47.8817 17 39.258 24.8467 38.2868 35.1172" +
        "L2.0693 418.117C0.959407 429.854 10.191 440 21.9805 440Z",
    },
    { kind: "rect", x: 60, y: 440, w: 376, h: 35, fill: "accent" },
    {
      kind: "path",
      fill: "accent",
      d: "M0 528C0 498.729 23.7289 475 53 475H442C471.271 475 495 498.729 495 528V1200H0V528Z",
    },
    {
      kind: "path",
      fill: "accent",
      d: "M495 1200H0L50 2835H445L495 1200Z",
    },
    {
      kind: "path",
      fill: "body",
      d: "M73 58C73 52.4772 77.4772 48 83 48H93C98.5228 48 103 52.4772 103 58V334C103 339.523 98.5228 344 93 344H83C77.4772 344 73 339.523 73 334V58Z",
    },
    {
      kind: "path",
      fill: "body",
      d: "M153 58C153 52.4772 157.477 48 163 48H173C178.523 48 183 52.4772 183 58V334C183 339.523 178.523 344 173 344H163C157.477 344 153 339.523 153 334V58Z",
    },
    {
      kind: "path",
      fill: "body",
      d: "M313 58C313 52.4772 317.477 48 323 48H333C338.523 48 343 52.4772 343 58V334C343 339.523 338.523 344 333 344H323C317.477 344 313 339.523 313 334V58Z",
    },
    {
      kind: "path",
      fill: "body",
      d: "M393 58C393 52.4772 397.477 48 403 48H413C418.523 48 423 52.4772 423 58V334C423 339.523 418.523 344 413 344H403C397.477 344 393 339.523 393 334V58Z",
    },
    {
      kind: "path",
      fill: "body",
      d: "M233 58C233 52.4772 237.477 48 243 48H253C258.523 48 263 52.4772 263 58V334C263 339.523 258.523 344 253 344H243C237.477 344 233 339.523 233 334V58Z",
    },
    {
      kind: "path",
      fill: "body",
      d: "M73 17C73 7.61116 80.6112 0 90 0H406C415.389 0 423 7.61116 423 17V17H73V17Z",
    },
  ];
}

/** Exact keyboard SVG (viewBox 0 0 800 240), flipped 180°. */
function keyboardGlyph(): RiderGlyphShape[] {
  return [
    {
      kind: "group",
      transform: `translate(${KEYBOARD_VIEWBOX.width}, ${KEYBOARD_VIEWBOX.height}) scale(-1, -1)`,
      shapes: [
        {
          kind: "path",
          fill: "accent",
          d:
            "M786.577 0H13.4228C6.00805 0 0 3.61654 0 8.07744V231.923C0 236.383 6.00805 240 13.4228 240H786.577C793.992 240 800 236.383 800 231.923V8.07744C800 3.61654 793.992 0 786.577 0ZM773.154 16.1549V53.7645H26.8456V16.1549H773.154ZM91.2215 69.9194V148.54H76.6926V69.9194H91.2215ZM104.644 164.695C112.059 164.695 118.067 161.078 118.067 156.617V69.9194H130.649V156.617C130.649 161.078 136.657 164.695 144.072 164.695H150.336V223.844H98.434V164.695H104.644ZM172.023 148.54H157.494V69.9194H172.023V148.54ZM177.181 164.695H185.446C192.859 164.695 198.869 161.078 198.869 156.617V69.9194H229.083V223.844H177.181V164.695ZM255.928 69.9194H287.932V156.617C287.932 161.078 293.94 164.695 301.355 164.695H307.83V223.844H255.928V69.9194ZM329.306 148.54H314.778V69.9194H329.306V148.54ZM334.676 164.695H342.729C350.144 164.695 356.152 161.078 356.152 156.617V69.9194H365.101V156.617C365.101 161.078 371.109 164.695 378.523 164.695H386.577V223.844H334.676V164.695ZM406.475 148.54H391.946V69.9194H406.475V148.54ZM413.423 164.695H419.898C427.313 164.695 433.321 161.078 433.321 156.617V69.9194H443.848V156.617C443.848 161.078 449.856 164.695 457.271 164.695H465.324V223.844H413.423V164.695ZM485.222 148.54H470.694V69.9194H485.222V148.54ZM492.17 164.695H498.645C506.06 164.695 512.068 161.078 512.068 156.617V69.9194H544.072V223.844H492.17V164.695ZM570.917 69.9194H600.864V156.617C600.864 161.078 606.872 164.695 614.287 164.695H622.819V223.844H570.917V69.9194ZM642.241 148.54H627.712V69.9194H642.241V148.54ZM649.664 164.695H655.664C663.078 164.695 669.086 161.078 669.086 156.617V69.9194H681.668V156.617C681.668 161.078 687.676 164.695 695.091 164.695H701.566V223.844H649.664V164.695ZM723.043 148.54H708.514V69.9194H723.043V148.54ZM26.8456 69.9194H49.847V156.617C49.847 161.078 55.855 164.695 63.2698 164.695H71.5884V223.844H26.8456V69.9194ZM728.412 223.844V164.695H736.465C743.88 164.695 749.888 161.078 749.888 156.617V69.9194H773.154V223.844H728.412Z",
        },
      ],
    },
  ];
}

/** Exact speaker wedge SVG (viewBox 0 0 471 261). */
const WEDGE_VIEWBOX = { width: 471, height: 261 } as const;

const WEDGE_GRILLE_DOTS: Array<[number, number]> = [
  [46, 11], [64, 11], [82, 11], [100, 11], [118, 11], [136, 11], [154, 11], [172, 11],
  [190, 11], [208, 11], [226, 11], [244, 11], [262, 11], [280, 11], [298, 11], [316, 11],
  [334, 11], [352, 11], [370, 11], [388, 11], [406, 11], [424, 11],
  [32, 29], [46, 29], [64, 29], [82, 29], [100, 29], [118, 29], [136, 29], [154, 29],
  [172, 29], [190, 29], [208, 29], [226, 29], [244, 29], [262, 29], [280, 29], [298, 29],
  [316, 29], [334, 29], [352, 29], [370, 29], [388, 29], [406, 29], [424, 29], [442, 29],
  [18, 47], [32, 47], [46, 47], [64, 47], [82, 47], [100, 47], [118, 47], [136, 47],
  [154, 47], [172, 47], [190, 47], [208, 47], [226, 47], [244, 47], [262, 47], [280, 47],
  [298, 47], [316, 47], [334, 47], [352, 47], [370, 47], [388, 47], [406, 47], [424, 47],
  [443, 47], [459, 47],
];

function wedgeGlyph(): RiderGlyphShape[] {
  return [
    {
      kind: "path",
      fill: "accent",
      d: "M471 61H0L47.5758 261H423.425L471 61Z",
    },
    {
      kind: "path",
      fill: "accent",
      d: "M471 54H0L47.5758 0H423.425L471 54Z",
    },
    ...WEDGE_GRILLE_DOTS.map(([cx, cy]) => ({
      kind: "circle" as const,
      cx,
      cy,
      r: 3,
      fill: "body" as const,
    })),
  ];
}

function tripodBase(cx: number, y: number, spread: number): RiderGlyphShape[] {
  return [
    {
      kind: "line",
      x1: cx,
      y1: y,
      x2: cx - spread,
      y2: y + 14,
      stroke: "accent",
      strokeWidth: 4,
    },
    {
      kind: "line",
      x1: cx,
      y1: y,
      x2: cx + spread,
      y2: y + 14,
      stroke: "accent",
      strokeWidth: 4,
    },
    {
      kind: "line",
      x1: cx,
      y1: y,
      x2: cx,
      y2: y + 16,
      stroke: "accent",
      strokeWidth: 4,
    },
  ];
}

function speakerCone(cx: number, cy: number, r: number): RiderGlyphShape[] {
  return [
    { kind: "circle", cx, cy, r, stroke: "accent", strokeWidth: 4, fill: "none" },
    { kind: "circle", cx, cy, r: r * 0.55, stroke: "accent", strokeWidth: 3, fill: "none" },
    { kind: "circle", cx, cy, r: r * 0.22, fill: "accent" },
  ];
}

/** Cabinet chassis shared by amp glyphs. */
function ampCabinet(x: number, y: number, w: number, h: number): RiderGlyphShape {
  return { kind: "rect", x, y, w, h, rx: 6, ...outline({ strokeWidth: 5 }) };
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
    shapes: badgedImportedGlyph(WIRELESS_MIC_VIEWBOX, wirelessHandheldMic(), 24),
    defaultInputs: [
      {
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
    widthFt: 2.6,
    depthFt: 2.6,
    shapes: badgedImportedGlyph(GUITAR_VIEWBOX, guitarGlyph()),
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
    shapes: badgedImportedGlyph(BASS_VIEWBOX, bassGlyph()),
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
    shapes: badgedImportedGlyph(KEYBOARD_VIEWBOX, keyboardGlyph(), 18),
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
      // Kick
      { kind: "circle", cx: 50, cy: 64, r: 16, fill: "accent" },
      // Toms
      { kind: "circle", cx: 32, cy: 40, r: 10, fill: "accent" },
      { kind: "circle", cx: 68, cy: 40, r: 10, fill: "accent" },
      // Snare hint
      { kind: "circle", cx: 50, cy: 42, r: 6, fill: "body", stroke: "accent", strokeWidth: 3 },
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
      // Mouthpiece / leadpipe
      { kind: "circle", cx: 22, cy: 50, r: 5, fill: "accent" },
      // Valve tubing
      { kind: "rect", x: 24, y: 44, w: 34, h: 12, rx: 3, fill: "accent" },
      // Valves
      { kind: "circle", cx: 34, cy: 38, r: 4, fill: "accent" },
      { kind: "circle", cx: 44, cy: 38, r: 4, fill: "accent" },
      { kind: "circle", cx: 54, cy: 38, r: 4, fill: "accent" },
      // Bell flare
      {
        kind: "path",
        d: "M56 40 L84 26 L84 74 L56 60 Z",
        fill: "accent",
      },
      // Bell rim
      {
        kind: "line",
        x1: 84,
        y1: 26,
        x2: 84,
        y2: 74,
        stroke: "body",
        strokeWidth: 3,
      },
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
      // Violin body (figure-8 as joined filled circles + waist)
      { kind: "circle", cx: 46, cy: 66, r: 15, fill: "accent" },
      { kind: "circle", cx: 46, cy: 46, r: 11, fill: "accent" },
      { kind: "rect", x: 38, y: 48, w: 16, h: 12, fill: "accent" },
      // Soundhole
      { kind: "circle", cx: 46, cy: 58, r: 4, fill: "body" },
      // Neck + scroll
      { kind: "rect", x: 43, y: 16, w: 6, h: 32, rx: 2, fill: "accent" },
      { kind: "circle", cx: 46, cy: 14, r: 6, fill: "accent" },
      // Bow
      {
        kind: "line",
        x1: 64,
        y1: 24,
        x2: 78,
        y2: 78,
        stroke: "accent",
        strokeWidth: 4,
      },
      {
        kind: "line",
        x1: 62,
        y1: 22,
        x2: 68,
        y2: 26,
        stroke: "accent",
        strokeWidth: 5,
      },
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
      { kind: "circle", cx: 36, cy: 54, r: 16, fill: "accent" },
      { kind: "circle", cx: 36, cy: 54, r: 8, fill: "body" },
      { kind: "circle", cx: 66, cy: 48, r: 13, fill: "accent" },
      { kind: "circle", cx: 66, cy: 48, r: 6, fill: "body" },
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
      { kind: "circle", cx: 30, cy: 52, r: 14, ...outline({ strokeWidth: 4 }) },
      { kind: "circle", cx: 70, cy: 52, r: 14, ...outline({ strokeWidth: 4 }) },
      { kind: "circle", cx: 30, cy: 52, r: 4, fill: "accent" },
      { kind: "circle", cx: 70, cy: 52, r: 4, fill: "accent" },
      { kind: "rect", x: 44, y: 38, w: 12, h: 28, rx: 2, fill: "accent" },
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
      { kind: "circle", cx: 50, cy: 36, r: 12, fill: "accent" },
      { kind: "path", d: "M28 78 C28 56 72 56 72 78 Z", fill: "accent" },
    ),
  },
];

const BACKLINE_SYMBOLS: RiderSymbol[] = [
  {
    key: "guitar_amp",
    label: "Guitar amp",
    defaultLabel: "Gtr amp",
    category: "backline",
    widthFt: 2.2,
    depthFt: 2.2,
    shapes: [
      ampCabinet(10, 10, 80, 80),
      // Handle / top rail
      { kind: "rect", x: 30, y: 14, w: 40, h: 6, rx: 2, fill: "accent" },
      ...speakerCone(50, 55, 24),
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
    widthFt: 2.4,
    depthFt: 2.4,
    shapes: [
      ampCabinet(8, 6, 84, 88),
      ...speakerCone(50, 32, 18),
      ...speakerCone(50, 70, 18),
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
    widthFt: 2.4,
    depthFt: 1.4,
    shapes: [
      { kind: "rect", x: 6, y: 28, w: 88, h: 44, rx: 5, ...outline({ strokeWidth: 5 }) },
      // Control knobs
      { kind: "circle", cx: 24, cy: 42, r: 5, fill: "accent" },
      { kind: "circle", cx: 40, cy: 42, r: 5, fill: "accent" },
      { kind: "circle", cx: 56, cy: 42, r: 5, fill: "accent" },
      { kind: "circle", cx: 72, cy: 42, r: 5, fill: "accent" },
      // Front grille
      { kind: "line", x1: 16, y1: 56, x2: 84, y2: 56, stroke: "accent", strokeWidth: 3 },
      { kind: "line", x1: 16, y1: 62, x2: 84, y2: 62, stroke: "accent", strokeWidth: 3 },
    ],
  },
  {
    key: "drum_kit",
    label: "Drum kit",
    defaultLabel: "Drum kit",
    category: "backline",
    // Realistic kit footprint — a bit wider than a keyboard.
    widthFt: 6,
    depthFt: 5,
    // Circles stay round inside the 6×5 footprint.
    preserveAspect: true,
    shapes: [
      // Kick
      { kind: "circle", cx: 52, cy: 58, r: 22, ...outline({ strokeWidth: 5 }) },
      { kind: "circle", cx: 52, cy: 58, r: 7, fill: "accent" },
      // Snare
      { kind: "circle", cx: 26, cy: 68, r: 12, ...outline({ strokeWidth: 4 }) },
      // Tom
      { kind: "circle", cx: 52, cy: 32, r: 11, ...outline({ strokeWidth: 4 }) },
      // One cymbal
      {
        kind: "circle",
        cx: 78,
        cy: 36,
        r: 12,
        stroke: "accent",
        strokeWidth: 3.5,
        fill: "none",
      },
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
    label: "Keyboard",
    defaultLabel: "Keys",
    category: "backline",
    glyphViewBox: KEYBOARD_VIEWBOX,
    widthFt: 4,
    depthFt: Number(((4 * KEYBOARD_VIEWBOX.height) / KEYBOARD_VIEWBOX.width).toFixed(2)),
    shapes: keyboardGlyph(),
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
    widthFt: 3.2,
    depthFt: 2,
    shapes: [
      { kind: "rect", x: 4, y: 16, w: 92, h: 68, rx: 5, ...outline({ strokeWidth: 5 }) },
      // Left platter
      { kind: "circle", cx: 26, cy: 50, r: 16, ...outline({ strokeWidth: 3.5 }) },
      { kind: "circle", cx: 26, cy: 50, r: 4, fill: "accent" },
      // Right platter
      { kind: "circle", cx: 74, cy: 50, r: 16, ...outline({ strokeWidth: 3.5 }) },
      { kind: "circle", cx: 74, cy: 50, r: 4, fill: "accent" },
      // Mixer
      { kind: "rect", x: 44, y: 28, w: 12, h: 44, rx: 2, fill: "accent" },
      { kind: "circle", cx: 50, cy: 38, r: 3, fill: "body" },
      { kind: "circle", cx: 50, cy: 50, r: 3, fill: "body" },
      { kind: "circle", cx: 50, cy: 62, r: 3, fill: "body" },
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
      { kind: "rect", x: 18, y: 14, w: 64, h: 46, rx: 4, ...outline() },
      { kind: "rect", x: 26, y: 22, w: 48, h: 30, rx: 2, fill: "accent" },
      { kind: "polygon", points: "12,78 88,78 78,62 22,62", fill: "accent" },
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
    glyphViewBox: WEDGE_VIEWBOX,
    widthFt: 2,
    depthFt: Number(((2 * WEDGE_VIEWBOX.height) / WEDGE_VIEWBOX.width).toFixed(2)),
    monitor: "wedge",
    shapes: wedgeGlyph(),
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
];

const INPUT_SYMBOLS: RiderSymbol[] = [
  {
    key: "vocal_mic",
    label: "Wired vocal",
    defaultLabel: "Vocal mic",
    category: "input",
    glyphViewBox: WIRED_VOCAL_VIEWBOX,
    widthFt: 1.6,
    depthFt: 1.6,
    shapes: wiredVocalMic(),
    defaultInputs: [
      { source: "Vocal", inputType: "mic", micPreference: "SM58", stand: "tall_boom" },
    ],
  },
  {
    key: "wireless_mic",
    label: "Wireless handheld",
    defaultLabel: "Wireless mic",
    category: "input",
    glyphViewBox: WIRELESS_MIC_VIEWBOX,
    ...tallFootprint(WIRELESS_MIC_VIEWBOX, 2.2),
    shapes: wirelessHandheldMic(),
    defaultInputs: [
      {
        source: "Wireless vocal",
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
    glyphViewBox: INSTRUMENT_MIC_VIEWBOX,
    ...tallFootprint(INSTRUMENT_MIC_VIEWBOX, 2.4),
    shapes: instrumentMic(),
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
      // Seat (top-down)
      { kind: "circle", cx: 50, cy: 42, r: 22, ...outline({ strokeWidth: 5 }) },
      { kind: "circle", cx: 50, cy: 42, r: 10, fill: "accent" },
      // Three legs
      { kind: "line", x1: 50, y1: 52, x2: 50, y2: 88, stroke: "accent", strokeWidth: 5 },
      { kind: "line", x1: 42, y1: 50, x2: 22, y2: 82, stroke: "accent", strokeWidth: 5 },
      { kind: "line", x1: 58, y1: 50, x2: 78, y2: 82, stroke: "accent", strokeWidth: 5 },
      // Foot ring
      {
        kind: "path",
        d: "M28 72 Q50 84 72 72",
        stroke: "accent",
        strokeWidth: 4,
        fill: "none",
      },
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
      // Desk plate (angled)
      {
        kind: "path",
        d: "M18 28 L82 22 L86 52 L22 58 Z",
        ...outline({ strokeWidth: 4 }),
      },
      // Lip
      { kind: "line", x1: 22, y1: 58, x2: 86, y2: 52, stroke: "accent", strokeWidth: 5 },
      // Stem
      { kind: "line", x1: 50, y1: 58, x2: 50, y2: 82, stroke: "accent", strokeWidth: 5 },
      // Base
      { kind: "line", x1: 28, y1: 88, x2: 72, y2: 88, stroke: "accent", strokeWidth: 5 },
      { kind: "line", x1: 50, y1: 82, x2: 34, y2: 92, stroke: "accent", strokeWidth: 4 },
      { kind: "line", x1: 50, y1: 82, x2: 66, y2: 92, stroke: "accent", strokeWidth: 4 },
    ],
  },
  {
    key: "table",
    label: "Table",
    defaultLabel: "Table",
    category: "stage",
    widthFt: 4,
    depthFt: 2,
    shapes: [{ kind: "rect", x: 6, y: 18, w: 88, h: 64, rx: 4, ...outline({ strokeWidth: 5 }) }],
  },
  {
    key: "note",
    label: "Note / label",
    defaultLabel: "Note",
    category: "stage",
    widthFt: 2.4,
    depthFt: 2,
    shapes: [
      // Card body with dog-ear
      {
        kind: "path",
        d: "M12 14 L72 14 L88 30 L88 86 L12 86 Z",
        ...outline({ strokeWidth: 4 }),
      },
      // Folded corner
      { kind: "path", d: "M72 14 L72 30 L88 30 Z", fill: "accent" },
      // Text lines
      { kind: "line", x1: 24, y1: 44, x2: 74, y2: 44, stroke: "accent", strokeWidth: 4 },
      { kind: "line", x1: 24, y1: 58, x2: 74, y2: 58, stroke: "accent", strokeWidth: 4 },
      { kind: "line", x1: 24, y1: 72, x2: 58, y2: 72, stroke: "accent", strokeWidth: 4 },
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
