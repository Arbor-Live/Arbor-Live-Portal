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
import { CountBarChart } from "@/components/insights/count-bar-chart";
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
            value <= rating ? "text-amber-500" : "text-muted-foreground/30",
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Responses</CardTitle>
            <CardDescription>Submitted in range</CardDescription>
          </CardHeader>
          <CardContent>
            {data === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">{data.total}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Average rating</CardTitle>
            <CardDescription>Out of 5</CardDescription>
          </CardHeader>
          <CardContent>
            {data === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">
                {formatAverageRating(data.averageRating)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Rating distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {data === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <CountBarChart data={data.ratingDistribution} valueLabel="Responses" />
            )}
          </CardContent>
        </Card>
      </div>

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
                className="space-y-1 rounded-md border p-3 text-sm"
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
