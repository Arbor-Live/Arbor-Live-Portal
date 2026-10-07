"use client";

import { useQuery } from "convex/react";
import { StarIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatRate, highRatingShare, ratingBreakdown, StatRow, StatTile } from "@/components/insights/insights-ui";
import { RowCell, RowList, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type InsightsPostMortemPanelProps = {
  startMs: number;
  endMs: number;
};

function RatingStars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <StarIcon
          key={value}
          className={cn(
            "size-3.5",
            value <= rating ? "text-status-amber-500" : "text-muted-foreground/30",
          )}
          weight={value <= rating ? "fill" : "regular"}
        />
      ))}
    </span>
  );
}

function formatAverageRating(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(2);
}

export function InsightsPostMortemPanel({ startMs, endMs }: InsightsPostMortemPanelProps) {
  const data = useQuery(api.analyticsPostMortems.getPostMortemInsights, { startMs, endMs });

  return (
    <div className="space-y-4" data-testid="insights-postmortem-panel">
      {data?.truncated ? (
        <p className="text-xs text-muted-foreground">
          Some post-mortems are truncated by scan limits — narrow the range for fuller totals.
        </p>
      ) : null}

      <StatRow className="lg:grid-cols-3">
        <StatTile
          label="Responses"
          loading={data === undefined}
          value={data?.total ?? 0}
          detail="Submitted in range"
        />
        <StatTile
          label="Average rating"
          loading={data === undefined}
          value={formatAverageRating(data?.averageRating ?? null)}
          detail="Out of 5"
        />
        <StatTile
          label="Rated 4 or 5"
          loading={data === undefined}
          value={formatRate(highRatingShare(data?.ratingDistribution ?? []))}
          detail={data ? ratingBreakdown(data.ratingDistribution) : null}
        />
      </StatRow>

      <Card>
        <CardHeader>
          <CardTitle>By event</CardTitle>
          <CardDescription>Average review rating per event, from crew and leads.</CardDescription>
        </CardHeader>
        <CardContent>
          {data === undefined ? (
            <Skeleton className="h-24 w-full" />
          ) : data.eventRatings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No event reviews in this range.</p>
          ) : (
            <RowList joined>
              {data.eventRatings.map((row) => (
                <ListRow key={row.eventId} href={`/dashboard/events/${row.eventId}`}>
                  <RowText
                    title={row.eventTitle ?? "Untitled event"}
                    detail={`${row.count} response${row.count === 1 ? "" : "s"}`}
                  />
                  <RatingStars rating={Math.round(row.average)} />
                  <RowCell className="w-10">{row.average.toFixed(1)}</RowCell>
                </ListRow>
              ))}
            </RowList>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Post-mortems</CardTitle>
          <CardDescription>Crew and lead reviews in range</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data === undefined ? (
            <Skeleton className="h-24 w-full" />
          ) : data.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No post-mortems in this range.</p>
          ) : (
            data.entries.map((entry) => (
              <div key={entry.id} className="space-y-2 border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <RatingStars rating={entry.rating} />
                  <span className="font-medium">{entry.eventTitle ?? "Untitled event"}</span>
                  {entry.personName ? (
                    <span className="text-muted-foreground">· {entry.personName}</span>
                  ) : null}
                  <span className="text-muted-foreground">
                    · {formatDateTime(entry.submittedAt)}
                  </span>
                </div>
                <div className="space-y-2 text-muted-foreground">
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-foreground/70">What went well</p>
                    <p className="whitespace-pre-wrap">{entry.whatWentWell}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-xs font-medium text-foreground/70">What could improve</p>
                    <p className="whitespace-pre-wrap">{entry.whatCouldImprove}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
