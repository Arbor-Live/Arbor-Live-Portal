"use client";

import { useState } from "react";
import {
  RIDER_CATEGORY_ORDER,
  RIDER_CATEGORY_PALETTE,
  riderSymbolsByCategory,
  type RiderSymbolCategory,
} from "@arbor/rider-document";
import { RiderSymbolGlyph } from "@/components/riders/rider-symbol-glyph";
import { RIDER_FAMILY } from "@/components/riders/rider-plot-theme";
import { RIDER_SYMBOL_MIME } from "@/components/riders/stage-plot-canvas";
import { cn } from "@/lib/utils";

/**
 * Gear to add, one family at a time: colour-coded tabs over a single row of
 * tiles. Drag a tile onto the stage, or tap it to drop it in the middle. It
 * sits above the stage on every screen size, so nothing covers the plot.
 */
export function RiderGearStrip({
  onAdd,
  counts,
}: {
  onAdd: (symbolKey: string) => void;
  /** How many of each family are on stage, shown on the tabs. */
  counts: Record<RiderSymbolCategory, number>;
}) {
  const [family, setFamily] = useState<RiderSymbolCategory>("performer");
  const symbols = riderSymbolsByCategory(family);

  return (
    <div className="border-b" data-testid="rider-gear-strip">
      <div role="tablist" aria-label="Gear families" className="flex gap-1 overflow-x-auto px-3 pt-3">
        {RIDER_CATEGORY_ORDER.map((category) => {
          const style = RIDER_FAMILY[category];
          const active = category === family;
          return (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFamily(category)}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 border px-2.5 text-xs font-medium transition-colors",
                active ? style.chip : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              <span className={cn("size-2 rounded-full", style.dot)} aria-hidden />
              {RIDER_CATEGORY_PALETTE[category].label}
              {counts[category] > 0 ? (
                <span className="tabular-nums opacity-70">{counts[category]}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div role="tabpanel" className="flex gap-1.5 overflow-x-auto px-3 py-3">
        {symbols.map((symbol) => (
          <button
            key={symbol.key}
            type="button"
            draggable
            title={symbol.hint ?? `Add ${symbol.label.toLowerCase()}`}
            onDragStart={(event) => {
              event.dataTransfer.setData(RIDER_SYMBOL_MIME, symbol.key);
              event.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => onAdd(symbol.key)}
            className={cn(
              "flex w-20 shrink-0 cursor-grab flex-col items-center gap-1.5 border bg-card px-1 py-2 text-center transition-colors",
              "hover:border-foreground/30 hover:bg-muted/40 active:cursor-grabbing",
              "focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 focus-visible:outline-none",
            )}
          >
            <RiderSymbolGlyph symbolKey={symbol.key} size={34} />
            <span className="line-clamp-2 text-2xs leading-tight">{symbol.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
