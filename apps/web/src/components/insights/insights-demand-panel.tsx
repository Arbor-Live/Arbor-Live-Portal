"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CountBarChart } from "@/components/insights/count-bar-chart";

type InsightsDemandPanelProps = {
  startMs: number;
  endMs: number;
};

function formatRate(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

function formatSigned(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${value.toFixed(0)}` : value.toFixed(0);
}

function formatDays(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} days`;
}

function shortMonthLabel(monthKey: string) {
  const [year, month] = monthKey.split("-");
  const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const index = Number(month) - 1;
  return `${labels[index] ?? month} ${year?.slice(2) ?? ""}`;
}

export function InsightsDemandPanel({ startMs, endMs }: InsightsDemandPanelProps) {
  const rangeArgs = { startMs, endMs };
  const funnel = useQuery(api.analyticsDemand.getBookingFunnel, rangeArgs);
  const volume = useQuery(api.analyticsDemand.getEventsVolume, rangeArgs);
  const calendar = useQuery(api.analyticsDemand.getCalendarLoad, rangeArgs);
  const quoteApproval = useQuery(api.analyticsDemand.getQuoteApprovalRates, rangeArgs);
  const declineReasons = useQuery(api.analyticsInstrumentation.getDeclineReasonBreakdown, rangeArgs);
  const pipelineDwell = useQuery(api.analyticsInstrumentation.getEventPipelineDwell, rangeArgs);
  const quoteEngagement = useQuery(api.analyticsInstrumentation.getQuoteEngagement, rangeArgs);
  const deliveryQuality = useQuery(api.analyticsInstrumentation.getDeliveryQuality, rangeArgs);
  const upcoming = useQuery(api.analyticsEvents.getUpcomingEventsInsights, {});

  const anyTruncated =
    funnel?.truncated ||
    volume?.truncated ||
    calendar?.truncated ||
    quoteApproval?.truncated ||
    declineReasons?.truncated ||
    pipelineDwell?.truncated ||
    quoteEngagement?.truncated ||
    deliveryQuality?.truncated ||
    upcoming?.truncated;

  return (
    <div className="space-y-4">
      {anyTruncated ? (
        <p className="text-xs text-muted-foreground">
          Some series are truncated by scan limits — narrow the range for fuller totals.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader>
            <CardTitle>Requests</CardTitle>
            <CardDescription>Submitted in range</CardDescription>
          </CardHeader>
          <CardContent>
            {funnel === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">{funnel.total}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Conversion</CardTitle>
            <CardDescription>Converted / decided</CardDescription>
          </CardHeader>
          <CardContent>
            {funnel === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">
                {formatRate(funnel.conversionRate)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Events</CardTitle>
            <CardDescription>Non-cancelled starts</CardDescription>
          </CardHeader>
          <CardContent>
            {volume === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">{volume.total}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Upcoming (30d)</CardTitle>
            <CardDescription>Starts in the next 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {upcoming === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">
                {upcoming.horizons.d30.eventCount}
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Quote approval</CardTitle>
            <CardDescription>Finalized in range</CardDescription>
          </CardHeader>
          <CardContent>
            {quoteApproval === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <p className="text-2xl font-semibold tabular-nums">
                {quoteApproval.totalFinalized === 0
                  ? "—"
                  : formatRate(quoteApproval.approved / quoteApproval.totalFinalized)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Booking funnel</CardTitle>
            <CardDescription>Status of requests submitted in range</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {funnel === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <CountBarChart
                  data={[
                    { key: "Submitted", count: funnel.submitted },
                    { key: "In review", count: funnel.inReview },
                    { key: "Converted", count: funnel.converted },
                    { key: "Declined", count: funnel.declined },
                  ]}
                />
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <p>
                    Submitted → review: median {formatDays(funnel.timeToReviewDays.medianDays)}{" "}
                    (n={funnel.timeToReviewDays.sampleSize})
                  </p>
                  <p>
                    Submitted → converted: median {formatDays(funnel.timeToConvertedDays.medianDays)}{" "}
                    (n={funnel.timeToConvertedDays.sampleSize})
                  </p>
                  <p>
                    Submitted → declined: median {formatDays(funnel.timeToDeclinedDays.medianDays)}{" "}
                    (n={funnel.timeToDeclinedDays.sampleSize})
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Events over time</CardTitle>
            <CardDescription>By start month</CardDescription>
          </CardHeader>
          <CardContent>
            {volume === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <CountBarChart
                data={volume.byMonth.map((row) => ({
                  key: shortMonthLabel(row.key),
                  count: row.count,
                }))}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By event type</CardTitle>
          </CardHeader>
          <CardContent>
            {volume === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <CountBarChart data={volume.byEventType} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By venue</CardTitle>
            <CardDescription>Top venues</CardDescription>
          </CardHeader>
          <CardContent>
            {volume === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <CountBarChart data={volume.byVenue} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>By host type</CardTitle>
          </CardHeader>
          <CardContent>
            {volume === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <CountBarChart data={volume.byHostType} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Calendar load</CardTitle>
            <CardDescription>Free / busy / unavailable days (same thresholds as public booking)</CardDescription>
          </CardHeader>
          <CardContent>
            {calendar === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <CountBarChart
                  data={[
                    { key: "Free", count: calendar.freeDays },
                    { key: "Busy", count: calendar.busyDays },
                    { key: "Unavailable", count: calendar.unavailableDays },
                  ]}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {calendar.daysWithEvents} of {calendar.totalDays} days have events
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quote approval mix</CardTitle>
            <CardDescription>Finalized invoices created in range</CardDescription>
          </CardHeader>
          <CardContent>
            {quoteApproval === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <CountBarChart
                data={[
                  { key: "Pending", count: quoteApproval.pending },
                  { key: "Approved", count: quoteApproval.approved },
                  { key: "Changes", count: quoteApproval.changesRequested },
                ]}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Decline reasons</CardTitle>
            <CardDescription>Why submitted requests were declined</CardDescription>
          </CardHeader>
          <CardContent>
            {declineReasons === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : declineReasons.totalDeclined === 0 ? (
              <p className="text-sm text-muted-foreground">No declined requests in range.</p>
            ) : (
              <CountBarChart data={declineReasons.byReason} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Event pipeline dwell</CardTitle>
            <CardDescription>Median days in each stage (instrumented transitions)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {pipelineDwell === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : pipelineDwell.eventsWithTransitions === 0 ? (
              <p className="text-sm text-muted-foreground">
                No status transitions recorded yet for events in this range.
              </p>
            ) : (
              <>
                <CountBarChart
                  data={pipelineDwell.stages.map((stage) => ({
                    key: stage.stage,
                    count: stage.medianDays ?? 0,
                  }))}
                />
                <p className="text-xs text-muted-foreground">
                  Based on {pipelineDwell.eventsWithTransitions} events with transitions.
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quote engagement</CardTitle>
            <CardDescription>Client portal opens for quotes sent in range</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {quoteEngagement === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <p>
                  <span className="text-muted-foreground">On portal:</span>{" "}
                  <span className="font-medium tabular-nums">{quoteEngagement.quotesOnPortal}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Opened at least once:</span>{" "}
                  <span className="font-medium tabular-nums">
                    {formatRate(quoteEngagement.openRate)} ({quoteEngagement.quotesOpened})
                  </span>
                </p>
                <p>
                  <span className="text-muted-foreground">Total opens:</span>{" "}
                  <span className="font-medium tabular-nums">{quoteEngagement.totalOpens}</span>
                  {quoteEngagement.avgOpensPerQuote != null ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · avg {quoteEngagement.avgOpensPerQuote.toFixed(1)} per quote
                    </span>
                  ) : null}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivery quality</CardTitle>
            <CardDescription>Actual vs expected turnout (events starting in range)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {deliveryQuality === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <>
                <p>
                  <span className="text-muted-foreground">With expected turnout:</span>{" "}
                  <span className="font-medium tabular-nums">{deliveryQuality.eventsWithExpected}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">With actual turnout recorded:</span>{" "}
                  <span className="font-medium tabular-nums">{deliveryQuality.eventsWithActual}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Median variance (actual − expected):</span>{" "}
                  <span className="font-medium tabular-nums">
                    {formatSigned(deliveryQuality.medianVariance)} guests
                  </span>
                  {deliveryQuality.eventsWithBoth > 0 ? (
                    <span className="text-muted-foreground"> (n={deliveryQuality.eventsWithBoth})</span>
                  ) : null}
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
