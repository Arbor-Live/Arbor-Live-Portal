"use client";

import { useQuery } from "convex/react";
import { CurrencyDollarIcon, PackageIcon, SignatureIcon, TruckIcon, WarningCircleIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { CountBarChart } from "@/components/insights/count-bar-chart";
import {
  formatDays,
  formatRate,
  formatUsdCompact,
  InsightCard,
  InsightGrid,
  plural,
  StatRow,
  StatTile,
  TruncatedNotice,
} from "@/components/insights/insights-ui";
import { RevenueBarChart } from "@/components/insights/revenue-bar-chart";
import { RowCell, RowList } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { formatUsd } from "@/lib/format";

type InsightsOpsPanelProps = {
  startMs: number;
  endMs: number;
};

const QUEUE_LABELS: Record<string, string> = {
  draft: "Upcoming shows",
  pending_onboarding: "Artist onboarding",
  pending_payee: "Needs payee details",
  pending_email: "Ready to send",
  awaiting_confirmation: "Waiting on signature",
  confirmed: "Ready to pay",
};

/** Artist payouts, damage and rental returns. */
export function InsightsOpsPanel({ startMs, endMs }: InsightsOpsPanelProps) {
  const rangeArgs = { startMs, endMs };
  const spend = useQuery(api.analyticsOps.getBandPayoutSpend, rangeArgs);
  const queueAging = useQuery(api.analyticsOps.getBandPayoutQueueAging, {});
  const turnaround = useQuery(api.analyticsOps.getBandPayoutTurnaround, rangeArgs);
  const damage = useQuery(api.analyticsOps.getDamageInsights, rangeArgs);
  const rentals = useQuery(api.analyticsOps.getRentalFulfillmentInsights, rangeArgs);

  const owedUsd = queueAging?.queues.reduce((sum, row) => sum + row.totalUsd, 0) ?? 0;
  const owedCount = queueAging?.queues.reduce((sum, row) => sum + row.count, 0) ?? 0;

  return (
    <div className="space-y-4" data-testid="insights-ops-panel">
      <TruncatedNotice
        show={
          spend?.truncated ||
          queueAging?.truncated ||
          turnaround?.truncated ||
          damage?.truncated ||
          rentals?.truncated
        }
      />

      <StatRow>
        <StatTile
          label="Owed to artists"
          loading={queueAging === undefined}
          value={formatUsdCompact(owedUsd)}
          detail={`${plural(owedCount, "payout")} not yet paid, upcoming shows included · right now`}
          link={{ href: "/dashboard/ops-center/artist-payouts", label: "Artist payouts" }}
          testId="insights-stat-owed-artists"
        />
        <StatTile
          label="Paid to artists"
          loading={spend === undefined}
          value={formatUsdCompact(spend?.totalUsd ?? 0)}
          detail={spend ? `${plural(spend.paymentCount, "payment")} paid in range` : null}
        />
        <StatTile
          label="Open damage"
          loading={damage === undefined}
          value={damage ? damage.openCount + damage.inProgressCount : 0}
          detail={damage ? `Median ${formatDays(damage.openAgingDays.medianDays)} open · right now` : null}
          link={{ href: "/dashboard/inventory/damage", label: "Damage queue" }}
        />
        <StatTile
          label="Rental returns missing"
          loading={rentals === undefined}
          value={formatRate(rentals?.missingRate, 1)}
          detail={
            rentals ? `${formatRate(rentals.damagedRate, 1)} damaged · ${plural(rentals.returnUnits, "unit")} returned` : null
          }
        />
      </StatRow>

      <InsightGrid>
        <InsightCard
          icon={SignatureIcon}
          title="Payout queue"
          description="Unpaid artist payouts by stage, in workflow order, with the median days in that stage."
          loading={queueAging === undefined}
          testId="insights-payout-queue"
        >
          {queueAging ? (
            <RowList joined>
              {queueAging.queues.map((row) => (
                <ListRow key={row.status} href="/dashboard/ops-center/artist-payouts">
                  <span className="min-w-0 flex-1 truncate">{QUEUE_LABELS[row.status] ?? row.status}</span>
                  <RowCell className="w-20" hideBelow="sm" muted>
                    {row.status === "draft" ? "" : formatDays(row.medianAgeDays)}
                  </RowCell>
                  <RowCell className="w-10" muted>
                    {row.count}
                  </RowCell>
                  <RowCell className="w-24 font-medium">{formatUsd(row.totalUsd)}</RowCell>
                </ListRow>
              ))}
            </RowList>
          ) : null}
        </InsightCard>

        <InsightCard icon={CurrencyDollarIcon} title="Payouts by month" description="Paid in range." loading={spend === undefined}>
          {spend ? (
            <RevenueBarChart months={spend.byMonth} emptyLabel="No artist payouts paid in this range." valueLabel="Payouts" />
          ) : null}
        </InsightCard>

        <InsightCard
          icon={SignatureIcon}
          title="Payout turnaround"
          description="For payouts paid in range: from the payout email to the artist signing, then to payment."
          loading={turnaround === undefined}
        >
          {turnaround ? (
            <RowList joined>
              {[
                { key: "sign", label: "Email sent → signed", stats: turnaround.emailToConfirmed },
                { key: "pay", label: "Signed → paid", stats: turnaround.confirmedToPaid },
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
          ) : null}
        </InsightCard>

        <InsightCard
          icon={WarningCircleIcon}
          title="Damage by equipment type"
          description="Which gear gets reported damaged most, from reports opened in range."
          loading={damage === undefined}
          testId="insights-damage-by-type"
        >
          {damage ? (
            <>
              <CountBarChart data={damage.byType} valueLabel="Reports" emptyLabel="No damage reported in this range." />
              <p className="text-xs text-muted-foreground">
                {plural(damage.reportedInRange, "report")} opened · {damage.resolvedInRange} resolved, median{" "}
                {formatDays(damage.resolutionDays.medianDays)} to fix.
              </p>
            </>
          ) : null}
        </InsightCard>

        <InsightCard
          icon={PackageIcon}
          title="Damage severity"
          description="Reports opened in range, by severity from 1 to 5."
          loading={damage === undefined}
        >
          {damage ? (
            <CountBarChart data={damage.severityMix} valueLabel="Reports" emptyLabel="No damage reported in this range." />
          ) : null}
        </InsightCard>

        <InsightCard
          icon={TruckIcon}
          title="Rental fulfillment"
          description="From starting a rental pull to completing its return."
          loading={rentals === undefined}
        >
          {rentals ? (
            <RowList joined>
              <li className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">Completed</span>
                <RowCell className="w-24 font-medium">{rentals.completedCount}</RowCell>
              </li>
              <li className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">In progress</span>
                <RowCell className="w-24 font-medium">{rentals.inProgressCount}</RowCell>
              </li>
              <li className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">Median duration</span>
                <RowCell className="w-24 font-medium">{formatDays(rentals.durationDays.medianDays)}</RowCell>
              </li>
            </RowList>
          ) : null}
        </InsightCard>
      </InsightGrid>
    </div>
  );
}
