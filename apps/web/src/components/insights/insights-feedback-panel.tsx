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
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type InsightsFeedbackPanelProps = {
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

export function InsightsFeedbackPanel({ startMs, endMs }: InsightsFeedbackPanelProps) {
  const data = useQuery(api.analyticsFeedback.getEventFeedbackInsights, { startMs, endMs });

  return (
    <div className="space-y-4" data-testid="insights-feedback-panel">
      {data?.truncated ? (
        <p className="text-xs text-muted-foreground">
          Some feedback is truncated by scan limits — narrow the range for fuller totals.
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
          <CardTitle>Feedback</CardTitle>
          <CardDescription>Full client responses in range</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : data.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No feedback in this range.</p>
          ) : (
            data.entries.map((entry) => (
              <div
                key={entry.id}
                className="space-y-1 border p-3 text-sm"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <RatingStars rating={entry.rating} />
                  <span className="font-medium">{entry.eventTitle ?? "Untitled event"}</span>
                  {entry.invoiceNumber ? (
                    <span className="text-muted-foreground">· {entry.invoiceNumber}</span>
                  ) : null}
                  <span className="text-muted-foreground">
                    · {formatDateTime(entry.submittedAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-muted-foreground">{entry.comments}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
