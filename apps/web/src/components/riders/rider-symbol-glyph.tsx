"use client";

import { glyphNode, riderSymbol, RIDER_CATEGORY_PALETTE } from "@arbor/rider-document";
import type { GlyphComponents } from "@arbor/rider-document";

/** DOM equivalents of the PDF SVG primitives — same props, different renderer. */
export const DOM_GLYPH_COMPONENTS: GlyphComponents = {
  Rect: "rect",
  Circle: "circle",
  Polygon: "polygon",
  Path: "path",
  Line: "line",
  G: "g",
};

/**
 * Standalone preview of a symbol. Always drawn in a square so uniform glyph
 * scaling stays sharp in the palette (stage footprints still use real size).
 */
export function RiderSymbolGlyph({
  symbolKey,
  size = 30,
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
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {glyphNode({
        shapes: symbol.shapes,
        palette: RIDER_CATEGORY_PALETTE[symbol.category],
        components: DOM_GLYPH_COMPONENTS,
        rect: { x: 0, y: 0, width: size, height: size },
        glyphViewBox: symbol.glyphViewBox,
        preserveAspect: true,
        keyPrefix: `preview-${symbolKey}`,
      })}
    </svg>
  );
}
