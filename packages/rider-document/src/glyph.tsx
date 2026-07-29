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
  RiderGlyphViewBox,
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
  return shapes.flatMap((shape, index) => {
    const key = `${keyPrefix}-${index}`;

    if (shape.kind === "group") {
      return [
        createElement(
          components.G,
          { key, transform: shape.transform },
          ...glyphElements(shape.shapes, palette, components, key),
        ),
      ];
    }

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
        return [
          createElement(components.Rect, {
            ...common,
            x: shape.x,
            y: shape.y,
            width: shape.w,
            height: shape.h,
            rx: shape.rx,
          }),
        ];
      case "circle":
        return [
          createElement(components.Circle, {
            ...common,
            cx: shape.cx,
            cy: shape.cy,
            r: shape.r,
          }),
        ];
      case "polygon":
        return [createElement(components.Polygon, { ...common, points: shape.points })];
      case "path":
        return [
          createElement(components.Path, {
            ...common,
            d: shape.d,
            fillRule: shape.fillRule,
          }),
        ];
      case "line":
        return [
          createElement(components.Line, {
            ...common,
            fill: "none",
            x1: shape.x1,
            y1: shape.y1,
            x2: shape.x2,
            y2: shape.y2,
          }),
        ];
    }
  });
}

export type GlyphBoxTransformOptions = {
  viewBox?: RiderGlyphViewBox;
  /** Letterbox inside `rect` instead of stretching to fill it. */
  preserveAspect?: boolean;
};

/** Maps the authoring box onto a laid-out rectangle. */
export function glyphBoxTransform(
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  options?: GlyphBoxTransformOptions,
): string {
  const viewW = options?.viewBox?.width ?? 100;
  const viewH = options?.viewBox?.height ?? 100;

  if (options?.preserveAspect) {
    const scale = Math.min(rect.width / viewW, rect.height / viewH);
    const tx = rect.x + (rect.width - viewW * scale) / 2;
    const ty = rect.y + (rect.height - viewH * scale) / 2;
    return `translate(${round(tx)}, ${round(ty)}) scale(${round(scale, 5)})`;
  }

  const sx = rect.width / viewW;
  const sy = rect.height / viewH;
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
  glyphViewBox?: RiderGlyphViewBox;
  preserveAspect?: boolean;
  rotationTransform?: string;
  keyPrefix: string;
};

/** A fully placed glyph: rotation about the item centre, then box mapping. */
export function glyphNode({
  shapes,
  palette,
  components,
  rect,
  glyphViewBox,
  preserveAspect,
  rotationTransform,
  keyPrefix,
}: GlyphNodeProps): ReactNode {
  const boxed = createElement(
    components.G,
    {
      transform: glyphBoxTransform(rect, {
        viewBox: glyphViewBox,
        preserveAspect,
      }),
    },
    ...glyphElements(shapes, palette, components, keyPrefix),
  );
  if (!rotationTransform) return boxed;
  return createElement(components.G, { transform: rotationTransform }, boxed);
}
