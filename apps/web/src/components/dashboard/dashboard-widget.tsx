"use client";

import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import { EmptyState, RowList } from "@/components/list-page";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * A Home widget: a titled card with one link to the full page, an optional
 * summary line, and its items as `ListRow`s (see `WidgetRows`).
 */
export function DashboardWidget({
  icon: TitleIcon,
  title,
  link,
  summary,
  testId,
  children,
}: {
  icon: Icon;
  title: string;
  link?: { href: string; label: string };
  /** Plain-words counts above the rows ("4 events · 2 need crew"). */
  summary?: React.ReactNode;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <TitleIcon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
        {link ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={link.href}>{link.label}</Link>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-2">
        {summary ? <p className="text-sm text-muted-foreground">{summary}</p> : null}
        {children}
      </CardContent>
    </Card>
  );
}

/** Loading, empty, or the widget's rows in one joined frame. */
export function WidgetRows({
  loading,
  empty,
  testId,
  children,
}: {
  loading: boolean;
  /** Shown when there are no rows; say what happens next. */
  empty: React.ReactNode | null;
  testId?: string;
  children: React.ReactNode;
}) {
  if (loading) return <Skeleton className="h-16 w-full" />;
  if (empty) return <EmptyState>{empty}</EmptyState>;
  return (
    <RowList joined testId={testId}>
      {children}
    </RowList>
  );
}
