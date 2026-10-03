"use client";

import { DotsThreeIcon } from "@phosphor-icons/react";
import { StatusPill, type Tone } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * The dashboard's list shell (see the dashboard-design skill): a summary line,
 * rows (optionally grouped), a `⋯` menu per row, an empty state, and a side
 * panel for details. Pages compose these with `PageHeader` and `FilterBar`:
 *
 *   PageHeader
 *   FilterBar
 *   ListSummary (plain-words counts + the order rule)
 *   RowGroup / RowList → ListRow (`components/list-row.tsx`) with RowText,
 *     RowCell… inside and a RowMenu in `actions`
 *   DetailSheet → DetailSheetHeader, SheetSection…, DetailSheetFooter
 */

/** The summary line above a list, plus the ordering rule in muted text. */
export function ListSummary({
  children,
  order,
  testId,
}: {
  children: React.ReactNode;
  /** How the rows are ordered, in plain words ("Soonest first."). */
  order?: React.ReactNode;
  testId?: string;
}) {
  return (
    <div className="space-y-0.5">
      <p className="text-sm" data-testid={testId}>
        {children}
      </p>
      {order ? <p className="text-sm text-muted-foreground">{order}</p> : null}
    </div>
  );
}

/** A dashed box saying what to do next. */
export function EmptyState({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="space-y-2 border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
      <p>{children}</p>
      {action}
    </div>
  );
}

/**
 * A list of `ListRow`s. Stacked (the default) keeps each row's own border with
 * a gap between; `joined` draws one frame with dividers, for dense lists
 * under a column header.
 */
export function RowList({
  children,
  joined,
  className,
  testId,
}: {
  children: React.ReactNode;
  joined?: boolean;
  className?: string;
  testId?: string;
}) {
  return (
    <ul
      className={cn(joined ? "divide-y border [&>li]:border-0" : "space-y-2", className)}
      data-testid={testId}
    >
      {children}
    </ul>
  );
}

/**
 * A titled group of rows (a workflow stage, a day): a `bg-muted/20` header
 * with a count, then the rows. Use several inside one bordered wrapper, or on
 * their own.
 */
export function RowGroup({
  title,
  count,
  tone = "neutral",
  description,
  aside,
  leading,
  children,
  id,
  testId,
  className,
}: {
  title: React.ReactNode;
  count?: number;
  /** Colours the count pill: amber when the group needs someone. */
  tone?: Tone;
  description?: React.ReactNode;
  /** Right side of the header: a total, a "Show" toggle. */
  aside?: React.ReactNode;
  /** Left of the title: a select-all checkbox. */
  leading?: React.ReactNode;
  children?: React.ReactNode;
  id?: string;
  testId?: string;
  className?: string;
}) {
  return (
    <section id={id} data-testid={testId} className={cn("scroll-mt-4", className)}>
      <div className="flex flex-wrap items-center gap-2 bg-muted/20 px-3 py-2">
        {leading}
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {title}
            {count !== undefined ? (
              <StatusPill tone={tone} className="h-5 tabular-nums">
                {count}
              </StatusPill>
            ) : null}
          </p>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {aside}
      </div>
      {children ? <ul className="divide-y border-t [&>li]:border-0">{children}</ul> : null}
    </section>
  );
}

/**
 * The text block at the start of a `ListRow`'s main area: a tiny uppercase
 * context label, the name, and one muted detail line.
 */
export function RowText({
  eyebrow,
  title,
  detail,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1">
      {eyebrow ? (
        <p className="truncate text-2xs font-medium tracking-wide text-muted-foreground uppercase">{eyebrow}</p>
      ) : null}
      <p className="truncate font-medium">{title}</p>
      {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
    </div>
  );
}

const FLAG_TONE = {
  amber: "bg-status-amber-500/15 text-status-amber-800 dark:text-status-amber-200",
  rose: "bg-status-rose-500/15 text-status-rose-800 dark:text-status-rose-200",
  neutral: "bg-muted text-muted-foreground",
} as const;

/** A small inline flag on a row ("3 open slots", "No quote"): amber needs someone. */
export function RowFlag({
  children,
  tone = "amber",
  className,
}: {
  children: React.ReactNode;
  tone?: keyof typeof FLAG_TONE;
  className?: string;
}) {
  return (
    <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs whitespace-nowrap", FLAG_TONE[tone], className)}>
      {children}
    </span>
  );
}

const HIDE_BELOW = {
  sm: "hidden sm:block",
  md: "hidden md:block",
  lg: "hidden lg:block",
} as const;

/**
 * A fixed-width column inside a row, so rows line up. Numbers are
 * right-aligned and tabular; `hideBelow` drops the column on narrow screens.
 */
export function RowCell({
  children,
  className = "w-24",
  align = "right",
  hideBelow,
  muted,
}: {
  children: React.ReactNode;
  /** Width class (`w-24`, `w-32`…). */
  className?: string;
  align?: "left" | "right" | "center";
  hideBelow?: keyof typeof HIDE_BELOW;
  muted?: boolean;
}) {
  return (
    <span
      className={cn(
        "shrink-0 tabular-nums",
        align === "right" && "text-right",
        align === "center" && "text-center",
        muted && "text-xs text-muted-foreground",
        hideBelow ? HIDE_BELOW[hideBelow] : "block",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** The `⋯` menu at the end of a row: "Open details", then a separator, then destructive items. */
export function RowMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={label}>
          <DotsThreeIcon weight="bold" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * The side panel. Render its body keyed on the row (`<Body key={row._id} />`)
 * so drafts reset when another row opens, and close it only after an action
 * succeeds.
 */
export function DetailSheet({
  open,
  onOpenChange,
  testId,
  className,
  onOpenAutoFocus,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testId?: string;
  className?: string;
  /** Override where focus lands on open (e.g. not into a field that opens a list on focus). */
  onOpenAutoFocus?: (event: Event) => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn("w-full overflow-y-auto sm:max-w-lg", className)}
        data-testid={testId}
        onOpenAutoFocus={onOpenAutoFocus}
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}

export function DetailSheetHeader({
  title,
  pill,
  description,
}: {
  title: React.ReactNode;
  /** A `StatusPill` beside the title. */
  pill?: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <SheetHeader>
      <SheetTitle className="flex flex-wrap items-center gap-2 pr-8">
        {title}
        {pill}
      </SheetTitle>
      {description ? <SheetDescription>{description}</SheetDescription> : null}
    </SheetHeader>
  );
}

/** A section of the side panel, headed in small uppercase. */
export function SheetSection({
  title,
  action,
  children,
}: {
  title: string;
  /** Right of the heading: a small button ("Edit", "Add"). */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 border-t px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Label / value pairs inside a `SheetSection`. */
export function SheetFields({ children }: { children: React.ReactNode }) {
  return <dl className="space-y-2">{children}</dl>;
}

export function SheetField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** The panel's bottom bar: destructive actions left, the final action right. */
export function DetailSheetFooter({ start, children }: { start?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <SheetFooter className="sticky bottom-0 mt-auto flex-row flex-wrap items-center justify-between border-t bg-popover">
      {start ?? <span />}
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </SheetFooter>
  );
}
