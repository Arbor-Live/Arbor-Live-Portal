"use client";

import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { ArrowRightIcon } from "@phosphor-icons/react";
import { RowCell, RowFlag, RowList, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUsd, plural } from "@/lib/format";
import { cn } from "@/lib/utils";

export { plural };

/*
 * Building blocks shared by the Insights tabs: stat tiles for headline
 * numbers, cards for each question, and rows for ranked breakdowns. Keep
 * numbers in plain words next to what they measure.
 */

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function shortMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  return `${MONTH_LABELS[Number(month) - 1] ?? month} ${year?.slice(2) ?? ""}`;
}

export function formatRate(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDays(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} days`;
}

const compactUsd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** $4.2K / $1.3M for headline tiles; rows keep full `formatUsd`. */
export function formatUsdCompact(value: number) {
  return Math.abs(value) < 10_000 ? formatUsd(value) : compactUsd.format(value);
}

/** Share of responses rated 4 or 5, from `{ key: "1".."5", count }` buckets. */
export function highRatingShare(distribution: Array<{ key: string; count: number }>) {
  const total = distribution.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return null;
  const high = distribution.filter((row) => Number(row.key) >= 4).reduce((sum, row) => sum + row.count, 0);
  return high / total;
}

/** "5★ 3 · 4★ 1 · 3★ 0 · 2★ 0 · 1★ 0" for a stat tile's detail line. */
export function ratingBreakdown(distribution: Array<{ key: string; count: number }>) {
  return [...distribution]
    .sort((a, b) => Number(b.key) - Number(a.key))
    .map((row) => `${row.key}★ ${row.count}`)
    .join(" · ");
}

/** A row of stat tiles. */
export function StatRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>{children}</div>;
}

/** One headline number: label, value, one muted line of context, and an optional link. */
export function StatTile({
  label,
  value,
  detail,
  link,
  loading,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  link?: { href: string; label: string };
  loading?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1 border bg-card px-4 py-3" data-testid={testId}>
      <p className="text-sm text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
      )}
      {detail && !loading ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      {link ? (
        <Link
          href={link.href}
          className="mt-auto inline-flex items-center gap-1 pt-1 text-xs font-medium text-primary hover:underline"
        >
          {link.label}
          <ArrowRightIcon className="size-3" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

/** A section of an Insights tab: a card with an icon, a title and what it measures. */
export function InsightCard({
  icon: TitleIcon,
  title,
  description,
  loading,
  children,
  className,
  testId,
}: {
  icon?: Icon;
  title: string;
  description?: React.ReactNode;
  loading?: boolean;
  children: React.ReactNode;
  className?: string;
  testId?: string;
}) {
  return (
    <Card className={className} data-testid={testId}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {TitleIcon ? <TitleIcon className="size-4 text-muted-foreground" aria-hidden /> : null}
          {title}
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? <Skeleton className="h-16 w-full" /> : children}
      </CardContent>
    </Card>
  );
}

/** A two-column grid of InsightCards. */
export function InsightGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 lg:grid-cols-2">{children}</div>;
}

/** A heading that splits a tab into "Next 90 days" and "Selected range" parts. */
export function InsightSection({
  title,
  description,
  children,
  testId,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <section className="space-y-3" data-testid={testId}>
      <div>
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function TruncatedNotice({ show }: { show: boolean | undefined }) {
  if (!show) return null;
  return (
    <p className="text-xs text-muted-foreground">
      Some numbers hit a scan limit and are partial. Pick a shorter range for complete totals.
    </p>
  );
}

/**
 * Part-of-a-whole rows: each part's amount, its share, and a thin bar in one
 * hue (the bar is the share, so it never needs a legend).
 */
export function ShareRows({
  rows,
  total,
  format = formatUsd,
  empty,
  testId,
}: {
  rows: Array<{ key: string; label: React.ReactNode; value: number; detail?: React.ReactNode; flag?: React.ReactNode }>;
  total?: number;
  format?: (value: number) => string;
  empty: string;
  testId?: string;
}) {
  const sum = total ?? rows.reduce((acc, row) => acc + Math.max(0, row.value), 0);
  if (rows.length === 0 || sum <= 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }
  return (
    <RowList joined testId={testId}>
      {rows.map((row) => {
        const share = Math.max(0, row.value) / sum;
        return (
          <li key={row.key} className="flex items-center gap-3 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="flex items-center gap-2">
                <span className="truncate">{row.label}</span>
                {row.flag}
              </p>
              <div className="h-1.5 bg-muted" aria-hidden>
                <div className="h-full bg-primary/70" style={{ width: `${Math.round(share * 100)}%` }} />
              </div>
            </div>
            {row.detail ? (
              <RowCell className="w-20" hideBelow="sm" muted>
                {row.detail}
              </RowCell>
            ) : null}
            <RowCell className="w-24">{format(row.value)}</RowCell>
            <RowCell className="w-12" muted>
              {formatRate(share)}
            </RowCell>
          </li>
        );
      })}
    </RowList>
  );
}

export type MarginSegment = {
  key: string;
  events: number;
  revenueUsd: number;
  profitUsd: number;
  marginRate: number | null;
};

/** Revenue, profit and margin per segment (event type, venue). Order the rows by revenue, highest first. */
export function MarginRows({
  label,
  segments,
  empty,
  testId,
}: {
  /** The segment column's heading ("Event type", "Venue"). */
  label: string;
  segments: MarginSegment[];
  empty: string;
  testId?: string;
}) {
  if (segments.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <RowList joined testId={testId}>
      <li className="flex items-center gap-3 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
        <span className="min-w-0 flex-1">{label}</span>
        <RowCell className="w-16" hideBelow="sm" muted>
          Events
        </RowCell>
        <RowCell className="w-24" muted>
          Revenue
        </RowCell>
        <RowCell className="w-24" hideBelow="sm" muted>
          Profit
        </RowCell>
        <RowCell className="w-16" muted>
          Margin
        </RowCell>
      </li>
      {segments.map((segment) => (
        <li key={segment.key} className="flex items-center gap-3 px-3 py-2 text-sm">
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate">{segment.key}</span>
            {segment.profitUsd < 0 ? <RowFlag tone="rose">Loss</RowFlag> : null}
          </span>
          <RowCell className="w-16" hideBelow="sm" muted>
            {segment.events}
          </RowCell>
          <RowCell className="w-24">{formatUsd(segment.revenueUsd)}</RowCell>
          <RowCell className="w-24" hideBelow="sm">
            {formatUsd(segment.profitUsd)}
          </RowCell>
          <RowCell className="w-16 font-medium">{formatRate(segment.marginRate)}</RowCell>
        </li>
      ))}
    </RowList>
  );
}

/** A linked row in an Insights list (an event, an invoice, a crew member). */
export function InsightLinkRow({
  href,
  eyebrow,
  title,
  detail,
  flags,
  cells,
  testId,
}: {
  href: string;
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  detail?: React.ReactNode;
  flags?: React.ReactNode;
  cells?: React.ReactNode;
  testId?: string;
}) {
  return (
    <ListRow href={href} data-testid={testId}>
      <RowText eyebrow={eyebrow} title={title} detail={detail} />
      {flags}
      {cells}
    </ListRow>
  );
}
