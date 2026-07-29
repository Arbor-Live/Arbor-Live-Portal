/**
 * Layout maths for the stage plot, shared by the browser editor and the PDF so
 * a plot looks identical on screen and on paper.
 *
 * Plot space: x grows toward audience-left→right, y grows downstage (toward the
 * audience). Drawings are always from the audience's point of view, so the left
 * edge of the page is stage right.
 */

import { riderSymbol } from "./symbols";
import type { RiderStage, RiderStageItem } from "./types";

export type PlotBox = {
  width: number;
  height: number;
  /** Gutter reserved for the edge labels (audience, stage left/right). */
  padding: number;
};

export type PlotLayout = {
  width: number;
  height: number;
  padding: number;
  /** Pixels (or PDF points) per foot. */
  scale: number;
  stageFt: RiderStage;
  stage: { left: number; top: number; width: number; height: number };
  gridStepFt: number;
};

export function computePlotLayout(stageFt: RiderStage, box: PlotBox): PlotLayout {
  const widthFt = Math.max(stageFt.widthFt, 1);
  const depthFt = Math.max(stageFt.depthFt, 1);
  const innerWidth = Math.max(box.width - box.padding * 2, 1);
  const innerHeight = Math.max(box.height - box.padding * 2, 1);
  const scale = Math.min(innerWidth / widthFt, innerHeight / depthFt);
  const width = widthFt * scale;
  const height = depthFt * scale;

  return {
    width: box.width,
    height: box.height,
    padding: box.padding,
    scale,
    stageFt: { widthFt, depthFt },
    stage: {
      left: box.padding + (innerWidth - width) / 2,
      top: box.padding + (innerHeight - height) / 2,
      width,
      height,
    },
    gridStepFt: widthFt > 30 ? 4 : 2,
  };
}

export function ftToPx(
  layout: PlotLayout,
  xFt: number,
  yFt: number,
): { x: number; y: number } {
  return {
    x: layout.stage.left + xFt * layout.scale,
    y: layout.stage.top + yFt * layout.scale,
  };
}

export function pxToFt(
  layout: PlotLayout,
  x: number,
  y: number,
): { xFt: number; yFt: number } {
  return {
    xFt: (x - layout.stage.left) / layout.scale,
    yFt: (y - layout.stage.top) / layout.scale,
  };
}

export type ItemRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
};

export function itemRect(layout: PlotLayout, item: RiderStageItem): ItemRect {
  const symbol = riderSymbol(item.symbol);
  const scale = item.scale > 0 ? item.scale : 1;
  const width = symbol.widthFt * scale * layout.scale;
  const height = symbol.depthFt * scale * layout.scale;
  const centre = ftToPx(layout, item.xFt, item.yFt);
  return {
    x: centre.x - width / 2,
    y: centre.y - height / 2,
    width,
    height,
    cx: centre.x,
    cy: centre.y,
  };
}

/** SVG transform that spins an item about its own centre. */
export function itemTransform(rect: ItemRect, rotation: number): string | undefined {
  if (!rotation) return undefined;
  const angle = ((rotation % 360) + 360) % 360;
  if (!angle) return undefined;
  return `rotate(${angle}, ${rect.cx}, ${rect.cy})`;
}

export function gridLineOffsets(layout: PlotLayout): {
  vertical: number[];
  horizontal: number[];
} {
  const vertical: number[] = [];
  const horizontal: number[] = [];
  for (let ft = layout.gridStepFt; ft < layout.stageFt.widthFt; ft += layout.gridStepFt) {
    vertical.push(layout.stage.left + ft * layout.scale);
  }
  for (let ft = layout.gridStepFt; ft < layout.stageFt.depthFt; ft += layout.gridStepFt) {
    horizontal.push(layout.stage.top + ft * layout.scale);
  }
  return { vertical, horizontal };
}

/**
 * Label plate for an item, in the same coordinate space as `itemRect`. Labels
 * sit under the symbol, and flip above it near the downstage edge so they never
 * collide with the audience bar.
 */
export function labelRect(
  layout: PlotLayout,
  rect: ItemRect,
  labelHeight = 9,
): { left: number; top: number; width: number } {
  const width = Math.max(rect.width, layout.scale * 3.2);
  const gap = Math.max(layout.scale * 0.12, 1.5);
  const below = rect.y + rect.height + gap;
  const stageBottom = layout.stage.top + layout.stage.height;
  return {
    left: rect.cx - width / 2,
    top: below + labelHeight > stageBottom ? rect.y - gap - labelHeight : below,
    width,
  };
}

export const PLOT_COLORS = {
  stageFill: "#ffffff",
  stageBorder: "#0f172a",
  grid: "#e2e8f0",
  gridStrong: "#cbd5e1",
  label: "#0f172a",
  edgeLabel: "#64748b",
  audienceBar: "#0f172a",
} as const;
