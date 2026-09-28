"use client";

import { useState } from "react";
import { CaretDownIcon, TrashIcon, type Icon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The line-items table: one grid shared by every section, so the whole quote
 * scans as one document. Columns: item · qty · rate · amount · row actions.
 * It sizes to the table (`@container/lines`), not the viewport: when the
 * table is narrow the item takes its own line above qty · rate · amount.
 */
export const LINE_GRID =
  "grid items-start gap-2 grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] [&>*:first-child]:col-span-full @3xl/lines:grid-cols-[minmax(0,1fr)_8.5rem_7.5rem_7rem_4rem] @3xl/lines:[&>*:first-child]:col-span-1";


export function plural(count: number, word: string, pluralWord = `${word}s`) {
  return `${count} ${count === 1 ? word : pluralWord}`;
}

/** A section of the table: header row with its subtotal, then its rows. */
export function LineGroup({
  icon: GroupIcon,
  title,
  detail,
  subtotalUsd,
  subtotalTestId,
  actions,
  testId,
  children,
}: {
  icon: Icon;
  title: string;
  /** Muted text after the title ("3 lines", "12 hrs"). */
  detail?: React.ReactNode;
  subtotalUsd: number;
  subtotalTestId?: string;
  /** Small buttons in the header row (e.g. Sync pull list). */
  actions?: React.ReactNode;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border" data-testid={testId}>
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-muted/20 px-3 py-2">
        <GroupIcon className="size-4 text-muted-foreground" aria-hidden />
        <h3 className="font-semibold">{title}</h3>
        {detail ? <span className="text-xs text-muted-foreground tabular-nums">{detail}</span> : null}
        <div className="ml-auto flex items-center gap-3">
          {actions}
          <span className="w-28 text-right font-semibold tabular-nums" data-testid={subtotalTestId}>
            {formatUsd(subtotalUsd)}
          </span>
        </div>
      </header>
      <div className="divide-y border-t">{children}</div>
    </section>
  );
}

/** Column labels above a group's rows (md and up). */
export function LineColumnHeads({ item = "Item", qty = "Qty", rate = "Rate" }: {
  item?: string;
  qty?: string;
  rate?: string;
}) {
  return (
    <div
      className={cn(
        LINE_GRID,
        "hidden px-3 py-1.5 text-2xs font-medium tracking-wide text-muted-foreground uppercase @3xl/lines:grid",
      )}
      aria-hidden
    >
      <span>{item}</span>
      <span>{qty}</span>
      <span>{rate}</span>
      <span className="text-right">Amount</span>
      <span />
    </div>
  );
}

/**
 * One line. `children` fills the item, qty, rate and amount cells; `details`
 * (package contents, basis, artist day) opens under the row.
 */
export function LineRow({
  testId,
  removeLabel,
  onRemove,
  details,
  detailsLabel = "details",
  defaultExpanded = false,
  context,
  children,
}: {
  testId: string;
  removeLabel?: string;
  onRemove?: () => void;
  details?: React.ReactNode;
  /** Names the details toggle for screen readers ("package contents"). */
  detailsLabel?: string;
  defaultExpanded?: boolean;
  /** A tiny uppercase label above the row ("Day 2"). */
  context?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div className="px-3 py-2 text-sm" data-testid={testId}>
      {context ? (
        <p className="mb-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase">{context}</p>
      ) : null}
      <div className={LINE_GRID}>
        {children}
        <div className="flex items-center justify-end gap-1 @3xl/lines:pt-0.5">
          {details ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-expanded={expanded}
              aria-label={`${expanded ? "Hide" : "Show"} ${detailsLabel}`}
              title={`${expanded ? "Hide" : "Show"} ${detailsLabel}`}
              onClick={() => setExpanded((open) => !open)}
            >
              <CaretDownIcon className={cn("transition-transform", expanded && "rotate-180")} />
            </Button>
          ) : null}
          {onRemove ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={removeLabel ?? "Remove line"}
              title="Remove line"
              onClick={onRemove}
            >
              <TrashIcon />
            </Button>
          ) : null}
        </div>
      </div>
      {details && expanded ? <div className="mt-2 border-t border-dashed pt-2">{details}</div> : null}
    </div>
  );
}

/** The right-aligned amount cell, with an optional muted hint under it ("4 × 3 shows"). */
export function AmountCell({ amountUsd, hint }: { amountUsd: number; hint?: React.ReactNode }) {
  return (
    <div className="text-right tabular-nums pt-1.5">
      <p className="font-medium">{formatUsd(amountUsd)}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** A read-only value in the qty or rate column. */
export function StaticCell({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <p className="text-muted-foreground tabular-nums pt-1.5" title={title}>
      {children}
    </p>
  );
}

/** Update row `index` of a list. */
export function patchRow<T>(rows: T[], index: number, patch: Partial<T> | ((row: T) => T)) {
  return rows.map((row, i) =>
    i === index ? (typeof patch === "function" ? patch(row) : { ...row, ...patch }) : row,
  );
}

export function removeRow<T>(rows: T[], index: number) {
  return rows.filter((_, i) => i !== index);
}
