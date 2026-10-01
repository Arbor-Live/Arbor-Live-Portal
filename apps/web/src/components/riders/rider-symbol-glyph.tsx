"use client";

import type { ComponentProps } from "react";
import { glyphNode, riderSymbol } from "@arbor/rider-document";
import type { GlyphComponents } from "@arbor/rider-document";
import { RIDER_FAMILY } from "@/components/riders/rider-plot-theme";
import { cn } from "@/lib/utils";

/** DOM equivalents of the PDF SVG primitives: same props, different renderer. */
export const DOM_GLYPH_COMPONENTS: GlyphComponents = {
  Rect: "rect",
  Circle: "circle",
  Polygon: "polygon",
  Path: "path",
  Line: "line",
  G: "g",
};

/**
 * Outlines and details are authored 1–2 units wide; icon strokes are 16 in a
 * 256 box. Small previews keep the thin ones at a fixed width so a drum kit
 * drawn 28px wide doesn't fade to hairlines, and let icon strokes scale.
 */
function previewStroke(strokeWidth: unknown) {
  return Number(strokeWidth) > 0 && Number(strokeWidth) < 4 ? "non-scaling-stroke" : undefined;
}

const PREVIEW_GLYPH_COMPONENTS: GlyphComponents = {
  Rect: (props: ComponentProps<"rect">) => <rect {...props} vectorEffect={previewStroke(props.strokeWidth)} />,
  Circle: (props: ComponentProps<"circle">) => (
    <circle {...props} vectorEffect={previewStroke(props.strokeWidth)} />
  ),
  Polygon: (props: ComponentProps<"polygon">) => (
    <polygon {...props} vectorEffect={previewStroke(props.strokeWidth)} />
  ),
  Path: (props: ComponentProps<"path">) => <path {...props} vectorEffect={previewStroke(props.strokeWidth)} />,
  Line: (props: ComponentProps<"line">) => <line {...props} vectorEffect={previewStroke(props.strokeWidth)} />,
  G: "g",
};

/**
 * Standalone preview of a symbol (gear strip, lists), letterboxed into a
 * square in its family colour.
 */
export function RiderSymbolGlyph({
  symbolKey,
  size = 28,
  className,
}: {
  symbolKey: string;
  size?: number;
  className?: string;
}) {
  const symbol = riderSymbol(symbolKey);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn("shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      {glyphNode({
        shapes: symbol.shapes,
        palette: RIDER_FAMILY[symbol.category].paint,
        components: PREVIEW_GLYPH_COMPONENTS,
        rect: { x: 1, y: 1, width: size - 2, height: size - 2 },
        glyphViewBox: symbol.glyphViewBox,
        preserveAspect: true,
        keyPrefix: `preview-${symbolKey}`,
      })}
    </svg>
  );
}
