"use client";

import { useQuery } from "convex/react";
import {
  ClipboardTextIcon,
  EnvelopeSimpleIcon,
  FunnelSimpleIcon,
  ReceiptIcon,
  TrendUpIcon,
  XIcon,
} from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { CountBarChart } from "@/components/insights/count-bar-chart";
import {
  formatDays,
  formatRate,
  InsightCard,
  InsightGrid,
  plural,
  StatRow,
  StatTile,
  TruncatedNotice,
} from "@/components/insights/insights-ui";
import { RowCell, RowList } from "@/components/list-page";

type InsightsDemandPanelProps = {
  startMs: number;
  endMs: number;
};

/** Booking requests and quotes: how many come in, how fast we answer, how many we win. */
export function InsightsDemandPanel({ startMs, endMs }: InsightsDemandPanelProps) {
  const rangeArgs = { startMs, endMs };
  const funnel = useQuery(api.analyticsDemand.getBookingFunnel, rangeArgs);
  const quoteApproval = useQuery(api.analyticsDemand.getQuoteApprovalRates, rangeArgs);
  const declineReasons = useQuery(api.analyticsInstrumentation.getDeclineReasonBreakdown, rangeArgs);
  const quoteEngagement = useQuery(api.analyticsInstrumentation.getQuoteEngagement, rangeArgs);

  return (
    <div className="space-y-4" data-testid="insights-demand-panel">
      <TruncatedNotice
        show={
          funnel?.truncated ||
          quoteApproval?.truncated ||
          declineReasons?.truncated ||
          quoteEngagement?.truncated
        }
      />

      <StatRow>
        <StatTile
          label="Requests"
          loading={funnel === undefined}
          value={funnel?.total.toLocaleString("en-US") ?? "0"}
          detail="Booking requests submitted in range"
        />
        <StatTile
          label="Conversion"
          loading={funnel === undefined}
          value={formatRate(funnel?.conversionRate)}
          detail={funnel ? `${funnel.converted} booked of ${funnel.converted + funnel.declined} decided` : null}
        />
        <StatTile
          label="Booking lead time"
          loading={funnel === undefined}
          value={formatDays(funnel?.bookingLeadDays.medianDays)}
          detail={
            funnel && funnel.bookingLeadDays.sampleSize > 0
              ? `Median, request to event · ${formatRate(funnel.bookingLeadDays.under30Share)} under 30 days out`
              : "Median, request to event"
          }
          testId="insights-stat-lead-time"
        />
        <StatTile
          label="Quote approval"
          loading={quoteApproval === undefined}
          value={
            !quoteApproval || quoteApproval.totalFinalized === 0
              ? "—"
              : formatRate(quoteApproval.approved / quoteApproval.totalFinalized)
          }
          detail={
            quoteApproval
              ? `Of finalized quotes created in range · ${quoteApproval.pending} still pending`
              : null
          }
        />
      </StatRow>

      <InsightGrid>
        <InsightCard
          icon={FunnelSimpleIcon}
          title="Booking funnel"
          description="Where requests submitted in range are now."
          loading={funnel === undefined}
        >
          {funnel ? (
            <>
              <CountBarChart
                data={[
                  { key: "Submitted", count: funnel.submitted },
                  { key: "Action required", count: funnel.actionRequired },
                  { key: "Pending", count: funnel.pendingClient },
                  { key: "Converted", count: funnel.converted },
                  { key: "Declined", count: funnel.declined },
                ]}
                valueLabel="Requests"
              />
              <RowList joined>
                {[
                  { key: "review", label: "Submitted → first review", stats: funnel.timeToReviewDays },
                  { key: "converted", label: "Submitted → booked", stats: funnel.timeToConvertedDays },
                  { key: "declined", label: "Submitted → declined", stats: funnel.timeToDeclinedDays },
                ].map((row) => (
                  <li key={row.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{row.label}</span>
                    <RowCell className="w-24 font-medium">{formatDays(row.stats.medianDays)}</RowCell>
                    <RowCell className="w-14" muted>
                      n={row.stats.sampleSize}
                    </RowCell>
                  </li>
                ))}
              </RowList>
            </>
          ) : null}
        </InsightCard>

        <InsightCard
          icon={TrendUpIcon}
          title="Conversion by category"
          description="Which kinds of events we win. Conversion counts only decided requests (booked or declined)."
          loading={funnel === undefined}
          testId="insights-conversion-by-category"
        >
          {funnel && funnel.byCategory.length > 0 ? (
            <RowList joined>
              <li className="flex items-center gap-3 bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
                <span className="min-w-0 flex-1">Most requests first</span>
                <RowCell className="w-20" muted>
                  Requests
                </RowCell>
                <RowCell className="w-16" hideBelow="sm" muted>
                  Booked
                </RowCell>
                <RowCell className="w-20" muted>
                  Conversion
                </RowCell>
              </li>
              {funnel.byCategory.map((row) => (
                <li key={row.key} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{row.key}</span>
                  <RowCell className="w-20">{row.total}</RowCell>
                  <RowCell className="w-16" hideBelow="sm" muted>
                    {row.converted}
                  </RowCell>
                  <RowCell className="w-20 font-medium">{formatRate(row.conversionRate)}</RowCell>
                </li>
              ))}
            </RowList>
          ) : (
            <p className="text-sm text-muted-foreground">No requests in this range.</p>
          )}
        </InsightCard>

        <InsightCard
          icon={XIcon}
          title="Decline reasons"
          description="Why requests submitted in range were declined."
          loading={declineReasons === undefined}
        >
          {declineReasons && declineReasons.totalDeclined > 0 ? (
            <CountBarChart data={declineReasons.byReason} valueLabel="Requests" />
          ) : (
            <p className="text-sm text-muted-foreground">No declined requests in this range.</p>
          )}
        </InsightCard>

        <InsightCard
          icon={ReceiptIcon}
          title="Quote approval mix"
          description="Finalized quotes created in range, by the client's answer."
          loading={quoteApproval === undefined}
        >
          {quoteApproval ? (
            <CountBarChart
              data={[
                { key: "Pending", count: quoteApproval.pending },
                { key: "Approved", count: quoteApproval.approved },
                { key: "Changes requested", count: quoteApproval.changesRequested },
              ]}
              valueLabel="Quotes"
            />
          ) : null}
        </InsightCard>

        <InsightCard
          icon={EnvelopeSimpleIcon}
          title="Quote engagement"
          description="Whether clients open the quotes we send them on the portal."
          loading={quoteEngagement === undefined}
        >
          {quoteEngagement ? (
            <RowList joined>
              <li className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">Quotes on the portal</span>
                <RowCell className="w-24 font-medium">{quoteEngagement.quotesOnPortal}</RowCell>
              </li>
              <li className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">Opened at least once</span>
                <RowCell className="w-24 font-medium">
                  {formatRate(quoteEngagement.openRate)} ({quoteEngagement.quotesOpened})
                </RowCell>
              </li>
              <li className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">Opens per quote</span>
                <RowCell className="w-24 font-medium">
                  {quoteEngagement.avgOpensPerQuote != null ? quoteEngagement.avgOpensPerQuote.toFixed(1) : "—"}
                </RowCell>
              </li>
            </RowList>
          ) : null}
        </InsightCard>

        <InsightCard
          icon={ClipboardTextIcon}
          title="Open requests"
          description="Requests from this range still waiting on someone."
          loading={funnel === undefined}
        >
          {funnel ? (
            <RowList joined>
              <li className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">Waiting on Arbor</span>
                <RowCell className="w-28 font-medium">
                  {plural(funnel.submitted + funnel.actionRequired, "request")}
                </RowCell>
              </li>
              <li className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">Waiting on the client</span>
                <RowCell className="w-28 font-medium">{plural(funnel.pendingClient, "request")}</RowCell>
              </li>
            </RowList>
          ) : null}
        </InsightCard>
      </InsightGrid>
    </div>
  );
}
