"use client";

import { useQuery } from "convex/react";
import {
  BuildingsIcon,
  CalendarBlankIcon,
  CalendarDotsIcon,
  ClockIcon,
  MapPinIcon,
  UsersThreeIcon,
  WarningIcon,
  XIcon,
} from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { CountBarChart } from "@/components/insights/count-bar-chart";
import {
  formatDays,
  formatRate,
  formatUsdCompact,
  InsightCard,
  InsightGrid,
  InsightLinkRow,
  InsightSection,
  plural,
  shortMonthLabel,
  StatRow,
  StatTile,
  TruncatedNotice,
} from "@/components/insights/insights-ui";
import { RowCell, RowFlag, RowList } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { formatEventStatusLabel, normalizeEventStatus } from "@/lib/event-status";
import { formatDate, formatUsd } from "@/lib/format";

type InsightsEventsPanelProps = {
  startMs: number;
  endMs: number;
};

const CANCEL_REASON_LABELS: Record<string, string> = {
  client_cancelled: "Client cancelled",
  weather: "Weather",
  venue: "Venue",
  staffing: "Staffing",
  duplicate: "Duplicate",
  other: "Other",
  unspecified: "No reason given",
};

function formatSigned(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${value.toFixed(0)}` : value.toFixed(0);
}

/** The calendar: what's coming up and whether it's ready, then what happened in range. */
export function InsightsEventsPanel({ startMs, endMs }: InsightsEventsPanelProps) {
  const rangeArgs = { startMs, endMs };
  const upcoming = useQuery(api.analyticsEvents.getUpcomingEventsInsights, {});
  const volume = useQuery(api.analyticsDemand.getEventsVolume, rangeArgs);
  const cancellations = useQuery(api.analyticsEvents.getCancellations, rangeArgs);
  const calendar = useQuery(api.analyticsDemand.getCalendarLoad, rangeArgs);
  const pipelineDwell = useQuery(api.analyticsInstrumentation.getEventPipelineDwell, rangeArgs);
  const turnout = useQuery(api.analyticsInstrumentation.getDeliveryQuality, rangeArgs);

  const d90 = upcoming?.horizons.d90;
  const readiness = d90
    ? [
        { key: "crew", label: "Need crew", count: d90.unconfirmedCrewedCount, href: "/dashboard/events/crew-scheduling" },
        { key: "invoice", label: "No quote or invoice", count: d90.missingInvoiceCount },
        { key: "lead", label: "No day-of lead or manager", count: d90.missingLeadCount },
        { key: "schedule", label: "No run of show", count: d90.missingScheduleCount },
      ]
    : [];

  return (
    <div className="space-y-6" data-testid="insights-events-panel">
      <TruncatedNotice
        show={
          upcoming?.truncated ||
          volume?.truncated ||
          cancellations?.truncated ||
          calendar?.truncated ||
          pipelineDwell?.truncated ||
          turnout?.truncated
        }
      />

      <InsightSection
        title="Coming up"
        description="Non-cancelled events starting from today. These don't follow the date range."
        testId="insights-events-upcoming"
      >
        <StatRow className="lg:grid-cols-5">
          <StatTile label="Next 7 days" loading={upcoming === undefined} value={upcoming?.horizons.d7.eventCount ?? 0} />
          <StatTile label="Next 30 days" loading={upcoming === undefined} value={upcoming?.horizons.d30.eventCount ?? 0} />
          <StatTile label="Next 90 days" loading={upcoming === undefined} value={d90?.eventCount ?? 0} />
          <StatTile
            label="Booked ahead"
            loading={upcoming === undefined}
            value={formatUsdCompact(d90?.bookedRevenueUsd ?? 0)}
            detail={d90 ? `Approved quotes on ${plural(d90.bookedEventCount, "event")} in the next 90 days` : null}
          />
          <StatTile
            label="Artist payouts due"
            loading={upcoming === undefined}
            value={formatUsdCompact(d90?.upcomingArtistPayoutsUsd ?? 0)}
            detail="Owed to artists on events in the next 90 days"
          />
        </StatRow>

        <InsightGrid>
          <InsightCard
            icon={WarningIcon}
            title="Readiness"
            description="Events in the next 90 days still missing something."
            loading={upcoming === undefined}
            testId="insights-events-readiness"
          >
            {d90 && d90.eventCount === 0 ? (
              <p className="text-sm text-muted-foreground">No events in the next 90 days.</p>
            ) : (
              <RowList joined>
                {readiness.map((row) => {
                  const content = (
                    <>
                      <span className="min-w-0 flex-1 truncate">{row.label}</span>
                      {row.count > 0 ? <RowFlag>{plural(row.count, "event")}</RowFlag> : null}
                      <RowCell className="w-16" muted>
                        {formatRate(d90 && d90.eventCount > 0 ? row.count / d90.eventCount : null)}
                      </RowCell>
                    </>
                  );
                  return "href" in row && row.href ? (
                    <ListRow key={row.key} href={row.href}>
                      {content}
                    </ListRow>
                  ) : (
                    <li key={row.key} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      {content}
                    </li>
                  );
                })}
              </RowList>
            )}
          </InsightCard>

          <InsightCard
            icon={CalendarDotsIcon}
            title="Coming up by status"
            description="Where the next 90 days sit in the pipeline."
            loading={upcoming === undefined}
          >
            {d90 ? (
              <CountBarChart
                data={d90.byStatus.map((row) => ({
                  key: formatEventStatusLabel(normalizeEventStatus(row.key)),
                  count: row.count,
                }))}
                valueLabel="Events"
                emptyLabel="No events in the next 90 days."
              />
            ) : null}
          </InsightCard>
        </InsightGrid>
      </InsightSection>

      <InsightSection
        title="In the selected range"
        description="Events starting between the dates above."
        testId="insights-events-range"
      >
        <StatRow>
          <StatTile
            label="Events"
            loading={volume === undefined}
            value={volume?.total ?? 0}
            detail="Non-cancelled events that started in range"
          />
          <StatTile
            label="Cancelled"
            loading={cancellations === undefined}
            value={cancellations?.cancelledEvents ?? 0}
            detail={cancellations ? `${formatRate(cancellations.cancellationRate)} of events in range` : null}
            testId="insights-stat-cancelled"
          />
          <StatTile
            label="Approved value cancelled"
            loading={cancellations === undefined}
            value={formatUsdCompact(cancellations?.approvedValueLostUsd ?? 0)}
            detail="Approved quotes on events that were then cancelled"
          />
          <StatTile
            label="Busy days"
            loading={calendar === undefined}
            value={calendar ? `${calendar.daysWithEvents} of ${calendar.totalDays}` : "—"}
            detail="Days in range with at least one event"
          />
        </StatRow>

        <InsightGrid>
          <InsightCard icon={CalendarBlankIcon} title="Events by month" description="By start month." loading={volume === undefined}>
            {volume ? (
              <CountBarChart
                data={volume.byMonth.map((row) => ({ key: shortMonthLabel(row.key), count: row.count }))}
                valueLabel="Events"
                emptyLabel="No events started in this range."
              />
            ) : null}
          </InsightCard>

          <InsightCard
            icon={XIcon}
            title="Cancellations"
            description="Why events in range were cancelled, and the most recent ones."
            loading={cancellations === undefined}
            testId="insights-cancellations"
          >
            {cancellations && cancellations.cancelledEvents > 0 ? (
              <>
                <RowList joined>
                  {cancellations.byReason.map((row) => (
                    <li key={row.reason} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">{CANCEL_REASON_LABELS[row.reason] ?? row.reason}</span>
                      <RowCell className="w-20">{plural(row.count, "event")}</RowCell>
                    </li>
                  ))}
                </RowList>
                <RowList joined>
                  {cancellations.recent.map((row) => (
                    <InsightLinkRow
                      key={row.eventId}
                      href={`/dashboard/events/${row.eventId}`}
                      eyebrow={formatDate(row.startAt)}
                      title={row.title}
                      detail={row.note ?? CANCEL_REASON_LABELS[row.reason]}
                      cells={
                        row.approvedValueUsd > 0 ? (
                          <RowCell className="w-24">{formatUsd(row.approvedValueUsd)}</RowCell>
                        ) : null
                      }
                    />
                  ))}
                </RowList>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No events in this range were cancelled.</p>
            )}
          </InsightCard>

          <InsightCard icon={CalendarDotsIcon} title="By event type" loading={volume === undefined}>
            {volume ? <CountBarChart data={volume.byEventType} valueLabel="Events" /> : null}
          </InsightCard>

          <InsightCard icon={MapPinIcon} title="By venue" description="Busiest venues." loading={volume === undefined}>
            {volume ? <CountBarChart data={volume.byVenue} valueLabel="Events" /> : null}
          </InsightCard>

          <InsightCard icon={BuildingsIcon} title="By host type" loading={volume === undefined}>
            {volume ? <CountBarChart data={volume.byHostType} valueLabel="Events" /> : null}
          </InsightCard>

          <InsightCard
            icon={CalendarBlankIcon}
            title="Calendar load"
            description="Free, busy and unavailable days, with the same thresholds as public booking."
            loading={calendar === undefined}
          >
            {calendar ? (
              <CountBarChart
                data={[
                  { key: "Free", count: calendar.freeDays },
                  { key: "Busy", count: calendar.busyDays },
                  { key: "Unavailable", count: calendar.unavailableDays },
                ]}
                valueLabel="Days"
              />
            ) : null}
          </InsightCard>

          <InsightCard
            icon={ClockIcon}
            title="Time in each stage"
            description="Median days events in range spent in each status. Status history is kept for a year."
            loading={pipelineDwell === undefined}
          >
            {pipelineDwell && pipelineDwell.eventsWithTransitions > 0 ? (
              <RowList joined>
                {pipelineDwell.stages.map((stage) => (
                  <li key={stage.stage} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                      {formatEventStatusLabel(normalizeEventStatus(stage.stage))}
                    </span>
                    <RowCell className="w-24 font-medium">{formatDays(stage.medianDays)}</RowCell>
                    <RowCell className="w-14" muted>
                      n={stage.sampleSize}
                    </RowCell>
                  </li>
                ))}
              </RowList>
            ) : (
              <p className="text-sm text-muted-foreground">No status changes recorded for events in this range.</p>
            )}
          </InsightCard>

          <InsightCard
            icon={UsersThreeIcon}
            title="Turnout vs expected"
            description="Actual guests against the expected count, for events that recorded both."
            loading={turnout === undefined}
          >
            {turnout ? (
              <RowList joined>
                <li className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">Median difference (actual − expected)</span>
                  <RowCell className="w-28 font-medium">{formatSigned(turnout.medianVariance)} guests</RowCell>
                </li>
                <li className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">Events with both counts</span>
                  <RowCell className="w-28">{turnout.eventsWithBoth}</RowCell>
                </li>
                <li className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">Expected count only</span>
                  <RowCell className="w-28">{Math.max(0, turnout.eventsWithExpected - turnout.eventsWithBoth)}</RowCell>
                </li>
              </RowList>
            ) : null}
          </InsightCard>
        </InsightGrid>
      </InsightSection>
    </div>
  );
}
