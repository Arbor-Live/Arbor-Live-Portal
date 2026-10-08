"use client";

import { CaretDownIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

/**
 * The `leading` slot of a nested `ListRow` (see `lib/tree.ts`): indents by
 * depth, then an optional control (a select checkbox), then the expand /
 * collapse caret, or a spacer so rows without children still line up.
 */
export function TreeRowLeading({
  depth,
  name,
  hasChildren,
  expanded,
  onToggle,
  children,
}: {
  depth: number;
  /** The row's name, for the caret's label ("Expand Warehouse"). */
  name: string;
  hasChildren: boolean;
  expanded: boolean;
  onToggle: () => void;
  /** Before the caret: a select checkbox. */
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1" style={{ paddingLeft: `${depth * 1.5}rem` }}>
      {children}
      {hasChildren ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          // The 24px caret keeps its look; the `after` ring makes the tap
          // target 32px without shifting the row.
          className="relative after:absolute after:-inset-1"
          aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          {expanded ? <CaretDownIcon weight="bold" /> : <CaretRightIcon weight="bold" />}
        </Button>
      ) : (
        <span className="size-6 shrink-0" aria-hidden />
      )}
    </div>
  );
}
