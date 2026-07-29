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
 * Standalone preview of a symbol, sized to its real footprint aspect ratio so
 * the palette hints at how much stage a thing actually takes up.
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
  const aspect = symbol.widthFt / symbol.depthFt;
  const width = aspect >= 1 ? size : size * aspect;
  const height = aspect >= 1 ? size / aspect : size;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {glyphNode({
        shapes: symbol.shapes,
        palette: RIDER_CATEGORY_PALETTE[symbol.category],
        components: DOM_GLYPH_COMPONENTS,
        rect: { x: 0, y: 0, width, height },
        keyPrefix: `preview-${symbolKey}`,
      })}
    </svg>
  );
}
