/**
 * Renders a symbol's glyph shapes.
 *
 * The browser (`svg`/`rect`/…) and `@react-pdf/renderer` (`Svg`/`Rect`/…) take
 * the same prop names for these primitives, so both renderers share this code
 * and only pass a different component map.
 */

import { createElement, type ElementType, type ReactNode } from "react";
import type {
  RiderCategoryPalette,
  RiderGlyphPaint,
  RiderGlyphShape,
} from "./symbols";

export type GlyphComponents = {
  Rect: ElementType;
  Circle: ElementType;
  Polygon: ElementType;
  Path: ElementType;
  Line: ElementType;
  G: ElementType;
};

function paint(
  value: RiderGlyphPaint | undefined,
  palette: RiderCategoryPalette,
  fallback: string,
): string {
  if (!value || value === "none") return fallback;
  return value === "body" ? palette.body : palette.accent;
}

/**
 * Glyph shapes are authored in a 0–100 box; callers wrap the result in a group
 * that translates and scales that box onto the item's footprint.
 */
export function glyphElements(
  shapes: RiderGlyphShape[],
  palette: RiderCategoryPalette,
  components: GlyphComponents,
  keyPrefix: string,
): ReactNode[] {
  return shapes.map((shape, index) => {
    const key = `${keyPrefix}-${index}`;
    const common = {
      key,
      fill: paint(shape.fill, palette, "none"),
      stroke: shape.stroke ? paint(shape.stroke, palette, "none") : undefined,
      strokeWidth: shape.stroke ? (shape.strokeWidth ?? 4) : undefined,
      strokeDasharray: shape.dashed ? "7 5" : undefined,
      strokeLinecap: "round" as const,
      strokeLinejoin: "round" as const,
    };

    switch (shape.kind) {
      case "rect":
        return createElement(components.Rect, {
          ...common,
          x: shape.x,
          y: shape.y,
          width: shape.w,
          height: shape.h,
          rx: shape.rx,
        });
      case "circle":
        return createElement(components.Circle, {
          ...common,
          cx: shape.cx,
          cy: shape.cy,
          r: shape.r,
        });
      case "polygon":
        return createElement(components.Polygon, { ...common, points: shape.points });
      case "path":
        return createElement(components.Path, { ...common, d: shape.d });
      case "line":
        return createElement(components.Line, {
          ...common,
          fill: "none",
          x1: shape.x1,
          y1: shape.y1,
          x2: shape.x2,
          y2: shape.y2,
        });
    }
  });
}

/** Maps the 0–100 authoring box onto a laid-out rectangle. */
export function glyphBoxTransform(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): string {
  const sx = rect.width / 100;
  const sy = rect.height / 100;
  return `translate(${round(rect.x)}, ${round(rect.y)}) scale(${round(sx, 5)}, ${round(sy, 5)})`;
}

function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export type GlyphNodeProps = {
  shapes: RiderGlyphShape[];
  palette: RiderCategoryPalette;
  components: GlyphComponents;
  rect: { x: number; y: number; width: number; height: number };
  rotationTransform?: string;
  keyPrefix: string;
};

/** A fully placed glyph: rotation about the item centre, then box mapping. */
export function glyphNode({
  shapes,
  palette,
  components,
  rect,
  rotationTransform,
  keyPrefix,
}: GlyphNodeProps): ReactNode {
  const boxed = createElement(
    components.G,
    { transform: glyphBoxTransform(rect) },
    ...glyphElements(shapes, palette, components, keyPrefix),
  );
  if (!rotationTransform) return boxed;
  return createElement(components.G, { transform: rotationTransform }, boxed);
}
