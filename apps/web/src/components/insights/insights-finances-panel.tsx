"use client";

import { useQuery } from "convex/react";
import {
  BuildingsIcon,
  ChartLineIcon,
  CurrencyDollarIcon,
  MapPinIcon,
  ReceiptIcon,
  WarningIcon,
} from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import {
  formatDays,
  formatRate,
  formatUsdCompact,
  InsightCard,
  InsightGrid,
  InsightLinkRow,
  MarginRows,
  plural,
  ShareRows,
  StatRow,
  StatTile,
  TruncatedNotice,
} from "@/components/insights/insights-ui";
import { RevenueBarChart } from "@/components/insights/revenue-bar-chart";
import { TopClientsTable } from "@/components/insights/top-clients-table";
import { useInsightsRange } from "@/components/insights/use-insights-range";
import { RowCell, RowFlag, RowList } from "@/components/list-page";
import { formatDate, formatUsd } from "@/lib/format";
import { getInsightsTabPath } from "@/lib/insights-tabs";
import { insightsSelectionToSearch } from "@/lib/insights-range";

type InsightsFinancesPanelProps = {
  startMs: number;
  endMs: number;
};

const AGING_LABELS = {
  not_due: "Not yet due",
  "1_30": "1–30 days past due",
  "31_60": "31–60 days past due",
  "61_90": "61–90 days past due",
  "90_plus": "Over 90 days past due",
} as const;

export function InsightsFinancesPanel({ startMs, endMs }: InsightsFinancesPanelProps) {
  const rangeArgs = { startMs, endMs };
  const { selection } = useInsightsRange();

  const summary = useQuery(api.analytics.getFinancialSummary, rangeArgs);
  const profit = useQuery(api.analyticsProfit.getProfitability, rangeArgs);
  const revenueByMonth = useQuery(api.analytics.getRevenueByMonth, rangeArgs);
  const revenueMix = useQuery(api.analytics.getRevenueMix, rangeArgs);
  const ar = useQuery(api.analytics.getArSnapshot, {});
  const quoteCycle = useQuery(api.analytics.getQuoteCashCycle, rangeArgs);
  const topClients = useQuery(api.analytics.getTopClients, { startMs, endMs, limit: 10 });
  const upcoming = useQuery(api.analyticsEvents.getUpcomingEventsInsights, {});

  const overdueUsd =
    ar?.aging.filter((bucket) => bucket.bucket !== "not_due").reduce((sum, bucket) => sum + bucket.totalUsd, 0) ?? 0;
  const eventsTabHref = `${getInsightsTabPath("events")}${insightsSelectionToSearch(selection)}`;

  return (
    <div className="space-y-4" data-testid="insights-finances-panel">
      <TruncatedNotice
        show={
          summary?.truncated ||
          profit?.truncated ||
          revenueByMonth?.truncated ||
          revenueMix?.truncated ||
          quoteCycle?.truncated ||
          topClients?.truncated ||
          upcoming?.truncated
        }
      />

      <StatRow className="lg:grid-cols-5">
        <StatTile
          label="Recognized revenue"
          loading={summary === undefined}
          value={formatUsdCompact(summary?.revenueRecognizedUsd ?? 0)}
          detail="Paid in range, net of artist and rental pass-through"
          testId="insights-stat-recognized"
        />
        <StatTile
          label="Booked"
          loading={summary === undefined}
          value={formatUsdCompact(summary?.revenueBookedUsd ?? 0)}
          detail="Quotes the client approved in range"
        />
        <StatTile
          label="Net profit"
          loading={profit === undefined}
          value={formatUsdCompact(profit?.netProfitUsd ?? 0)}
          detail={
            profit
              ? `${formatRate(profit.marginRate)} margin on ${plural(profit.bookedEvents, "booked event")}`
              : null
          }
          testId="insights-stat-net-profit"
        />
        <StatTile
          label="Open receivables"
          loading={ar === undefined}
          value={formatUsdCompact(ar?.openTotalUsd ?? 0)}
          detail={ar ? `${formatUsd(overdueUsd)} past due · right now` : null}
          link={{ href: "/dashboard/financial-hub/invoices/payments", label: "Payments" }}
        />
        <StatTile
          label="Booked ahead (next 90 days)"
          loading={upcoming === undefined}
          value={formatUsdCompact(upcoming?.horizons.d90.bookedRevenueUsd ?? 0)}
          detail={upcoming ? `On ${plural(upcoming.horizons.d90.bookedEventCount, "upcoming event")}` : null}
          link={{ href: eventsTabHref, label: "Upcoming events" }}
          testId="insights-stat-booked-ahead"
        />
      </StatRow>

      <InsightGrid>
        <InsightCard
          icon={ChartLineIcon}
          title="Revenue by month"
          description="Recognized when payment is received, net of pass-through."
          loading={revenueByMonth === undefined}
        >
          {revenueByMonth ? <RevenueBarChart months={revenueByMonth.months} /> : null}
        </InsightCard>

        <InsightCard
          icon={CurrencyDollarIcon}
          title="Margin by event type"
          description="Events starting in range with an approved quote, highest revenue first: each event's share of its invoices, minus its costs. Crew cost is the scheduled-shift estimate."
          loading={profit === undefined}
          testId="insights-margin-by-type"
        >
          {profit ? (
            <>
              <MarginRows label="Event type" segments={profit.byEventType} empty="No booked events in this range." />
              {profit.crewBilledUsd > 0 || profit.unbookedEvents > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {profit.crewBilledUsd > 0
                    ? `Crew billed ${formatUsd(profit.crewBilledUsd)} against ${formatUsd(profit.crewCostUsd)} estimated crew cost (${formatRate(profit.crewMarginRate)} labor margin). `
                    : ""}
                  {profit.unbookedEvents > 0
                    ? `${plural(profit.unbookedEvents, "event")} had ${formatUsd(profit.unbookedCostUsd)} in costs but no approved quote, so they're left out.`
                    : ""}
                </p>
              ) : null}
            </>
          ) : null}
        </InsightCard>

        <InsightCard
          icon={WarningIcon}
          title="Lowest-margin events"
          description="Booked events in range with the thinnest margin. Open one to check its billing and costs."
          loading={profit === undefined}
          testId="insights-lowest-margin"
        >
          {profit && profit.lowestMargin.length > 0 ? (
            <RowList joined>
              {profit.lowestMargin.map((row) => (
                <InsightLinkRow
                  key={row.eventId}
                  href={`/dashboard/events/${row.eventId}/billing`}
                  eyebrow={formatDate(row.startAt)}
                  title={row.title}
                  detail={`${formatUsd(row.revenueUsd)} revenue · ${formatUsd(row.profitUsd)} profit`}
                  flags={row.profitUsd < 0 ? <RowFlag tone="rose">Loss</RowFlag> : null}
                  cells={<RowCell className="w-16 font-medium">{formatRate(row.marginRate)}</RowCell>}
                />
              ))}
            </RowList>
          ) : (
            <p className="text-sm text-muted-foreground">No booked events in this range.</p>
          )}
        </InsightCard>

        <InsightCard
          icon={MapPinIcon}
          title="Margin by venue"
          description="The same margin by where the event happened, highest revenue first."
          loading={profit === undefined}
        >
          {profit ? <MarginRows label="Venue" segments={profit.byVenue} empty="No booked events in this range." /> : null}
        </InsightCard>

        <InsightCard
          icon={ReceiptIcon}
          title="Receivables aging"
          description="Approved invoices not yet paid, by days past the payment due date. Right now, not the range."
          loading={ar === undefined}
          testId="insights-ar-aging"
        >
          {ar ? (
            <>
              <ShareRows
                rows={ar.aging
                  .filter((bucket) => bucket.count > 0)
                  .map((bucket) => ({
                    key: bucket.bucket,
                    label: AGING_LABELS[bucket.bucket],
                    value: bucket.totalUsd,
                    detail: plural(bucket.count, "invoice"),
                  }))}
                empty="Nothing waiting on payment."
              />
              {ar.oldest.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Oldest past due
                  </p>
                  <RowList joined>
                    {ar.oldest.map((row) => (
                      <InsightLinkRow
                        key={row.invoiceId}
                        href={`/dashboard/financial-hub/invoices/${row.invoiceId}`}
                        eyebrow={row.invoiceNumber}
                        title={row.title}
                        detail={`Due ${formatDate(row.dueAt)}`}
                        flags={row.proofSubmitted ? <RowFlag tone="neutral">Proof sent</RowFlag> : null}
                        cells={
                          <>
                            <RowCell className="w-20" hideBelow="sm" muted>
                              {row.daysPastDue} days
                            </RowCell>
                            <RowCell className="w-24">{formatUsd(row.totalUsd)}</RowCell>
                          </>
                        }
                      />
                    ))}
                  </RowList>
                </div>
              ) : null}
            </>
          ) : null}
        </InsightCard>

        <InsightCard
          icon={CurrencyDollarIcon}
          title="Revenue mix"
          description="What paid invoices in range billed for, before discounts. Artists and external rentals are pass-through and left out."
          loading={revenueMix === undefined}
        >
          {revenueMix ? (
            <ShareRows
              rows={[
                { key: "equipment", label: "Equipment", value: revenueMix.equipmentUsd },
                { key: "crew", label: "Crew", value: revenueMix.crewUsd },
                { key: "fees", label: "Fees", value: revenueMix.feesUsd },
              ]
                .filter((row) => row.value > 0)
                .sort((a, b) => b.value - a.value)}
              empty="No paid invoices in this range."
            />
          ) : null}
        </InsightCard>

        <InsightCard
          icon={ReceiptIcon}
          title="Quote to cash"
          description="Median days from sending a quote for review to approval, and from approval to payment. Payment opens after the event, so the second mostly tracks event dates."
          loading={quoteCycle === undefined}
        >
          {quoteCycle ? (
            <RowList joined>
              {[
                { key: "approve", label: "Review → approved", stats: quoteCycle.reviewToApprove },
                { key: "paid", label: "Approved → paid", stats: quoteCycle.approveToPaid },
              ].map((row) => (
                <li key={row.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  <RowCell className="w-28" hideBelow="sm" muted>
                    avg {formatDays(row.stats.avgDays)}
                  </RowCell>
                  <RowCell className="w-24 font-medium">{formatDays(row.stats.medianDays)}</RowCell>
                  <RowCell className="w-14" muted>
                    n={row.stats.sampleSize}
                  </RowCell>
                </li>
              ))}
            </RowList>
          ) : null}
        </InsightCard>

        <InsightCard
          icon={BuildingsIcon}
          title="Top clients"
          description="Host organizations by revenue paid in range, net of pass-through."
          loading={topClients === undefined}
        >
          {topClients ? <TopClientsTable clients={topClients.clients} /> : null}
        </InsightCard>
      </InsightGrid>
    </div>
  );
}
