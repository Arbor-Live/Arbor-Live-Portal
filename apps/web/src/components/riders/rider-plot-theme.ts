import type { RiderCategoryPalette, RiderSymbolCategory } from "@arbor/rider-document";

/**
 * One hue per kind of gear, shared by the plot, the gear strip and the lists
 * (and matched by the PDF's palette in `@arbor/rider-document`). The colours
 * are theme tokens (`--rider-*` in globals.css), so they adapt to dark mode.
 */
type FamilyStyle = {
  /** Glyph paint on the canvas and in previews. */
  paint: RiderCategoryPalette;
  /** A small solid dot or bar. */
  dot: string;
  /** Text in the family colour. */
  text: string;
  /** A tinted chip: border, background, text. */
  chip: string;
  /** The family colour as an SVG stroke class. */
  stroke: string;
};

export const RIDER_FAMILY: Record<RiderSymbolCategory, FamilyStyle> = {
  performer: {
    paint: { body: "var(--rider-performer-fill)", accent: "var(--rider-performer)", label: "Performers" },
    dot: "bg-rider-performer",
    text: "text-rider-performer",
    chip: "border-rider-performer/35 bg-rider-performer/10 text-rider-performer",
    stroke: "stroke-rider-performer",
  },
  backline: {
    paint: { body: "var(--rider-backline-fill)", accent: "var(--rider-backline)", label: "Backline" },
    dot: "bg-rider-backline",
    text: "text-rider-backline",
    chip: "border-rider-backline/35 bg-rider-backline/10 text-rider-backline",
    stroke: "stroke-rider-backline",
  },
  monitor: {
    paint: { body: "var(--rider-monitor-fill)", accent: "var(--rider-monitor)", label: "Monitors" },
    dot: "bg-rider-monitor",
    text: "text-rider-monitor",
    chip: "border-rider-monitor/35 bg-rider-monitor/10 text-rider-monitor",
    stroke: "stroke-rider-monitor",
  },
  input: {
    paint: { body: "var(--rider-input-fill)", accent: "var(--rider-input)", label: "Mics & DIs" },
    dot: "bg-rider-input",
    text: "text-rider-input",
    chip: "border-rider-input/35 bg-rider-input/10 text-rider-input",
    stroke: "stroke-rider-input",
  },
  stage: {
    paint: { body: "var(--rider-stage-fill)", accent: "var(--rider-stage)", label: "Stage & power" },
    dot: "bg-rider-stage",
    text: "text-rider-stage",
    chip: "border-rider-stage/35 bg-rider-stage/10 text-rider-stage",
    stroke: "stroke-rider-stage",
  },
};

/**
 * Channel numbers as an engineer writes them, with runs collapsed: a kit on
 * 1, 2, 3 and 4–5 reads "1–5"; scattered channels read "4, 9".
 */
export function channelBadge(channels: Array<{ channel: number; stereo?: boolean }>): string | null {
  if (channels.length === 0) return null;
  const spans = [...channels]
    .sort((a, b) => a.channel - b.channel)
    .map((input) => [input.channel, input.channel + (input.stereo ? 1 : 0)] as [number, number]);
  const runs: Array<[number, number]> = [];
  for (const [start, end] of spans) {
    const last = runs.at(-1);
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else runs.push([start, end]);
  }
  return runs.map(([start, end]) => (start === end ? String(start) : `${start}–${end}`)).join(", ");
}
