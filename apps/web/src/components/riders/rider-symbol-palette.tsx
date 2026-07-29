"use client";

import {
  RIDER_CATEGORY_ORDER,
  RIDER_CATEGORY_PALETTE,
  riderSymbolsByCategory,
} from "@arbor/rider-document";
import { RiderSymbolGlyph } from "@/components/riders/rider-symbol-glyph";
import { RIDER_SYMBOL_MIME } from "@/components/riders/stage-plot-canvas";
import { cn } from "@/lib/utils";

type RiderSymbolPaletteProps = {
  onPlaceAtCenter?: (symbolKey: string) => void;
  disabled?: boolean;
  className?: string;
};

export function RiderSymbolPalette({
  onPlaceAtCenter,
  disabled = false,
  className,
}: RiderSymbolPaletteProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      {RIDER_CATEGORY_ORDER.map((category) => {
        const symbols = riderSymbolsByCategory(category);
        const palette = RIDER_CATEGORY_PALETTE[category];
        return (
          <section key={category} className="space-y-2">
            <h3
              className="text-[11px] font-semibold tracking-wide uppercase"
              style={{ color: palette.accent }}
            >
              {palette.label}
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              {symbols.map((symbol) => (
                <button
                  key={symbol.key}
                  type="button"
                  draggable={!disabled}
                  disabled={disabled}
                  title={symbol.hint ?? symbol.label}
                  onDragStart={(event) => {
                    if (disabled) return;
                    event.dataTransfer.setData(RIDER_SYMBOL_MIME, symbol.key);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => {
                    if (disabled) return;
                    onPlaceAtCenter?.(symbol.key);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md border px-1.5 py-2 text-center transition-colors",
                    "hover:border-foreground/30 hover:bg-muted/40",
                    "disabled:pointer-events-none disabled:opacity-50",
                    "cursor-grab active:cursor-grabbing",
                  )}
                  style={{
                    borderColor: `${palette.accent}33`,
                    backgroundColor: palette.body,
                  }}
                >
                  <RiderSymbolGlyph symbolKey={symbol.key} size={28} />
                  <span className="line-clamp-2 text-[10px] leading-tight font-medium text-slate-800">
                    {symbol.label}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
