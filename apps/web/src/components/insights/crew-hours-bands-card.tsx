"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { GaugeIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { InsightCard, plural } from "@/components/insights/insights-ui";
import { EmptyState, ListSummary, RowCell, RowGroup, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import type { Tone } from "@/components/page-header";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { recentQuarters } from "@/lib/insights-quarters";

type Band = "below_minimum" | "meets_minimum" | "above_expected";

const hours = (value: number) => `${value.toFixed(1)} h`;

/**
 * Crew against the quarterly hours expectations: under the minimum, meeting
 * it, above expectations. Picks its own quarter, separate from the page range.
 */
export function CrewHoursBandsCard() {
  const [now] = useState(() => Date.now());
  const quarters = useMemo(() => recentQuarters(now, 4), [now]);
  const [quarterId, setQuarterId] = useState(quarters[0]!.id);
  const quarter = quarters.find((option) => option.id === quarterId) ?? quarters[0]!;
  const data = useQuery(api.analyticsCrew.getCrewHoursBands, {
    startMs: quarter.startMs,
    endMs: quarter.endMs,
    now,
  });

  const groups: Array<{ band: Band; title: string; description: string; tone: Tone }> = data
    ? [
        {
          band: "below_minimum",
          title: "Below minimum",
          description: `Under ${data.minimumHours} h this quarter.`,
          tone: "amber",
        },
        {
          band: "meets_minimum",
          title: "Meets minimum",
          description: `${data.minimumHours}–${data.expectedHours} h this quarter.`,
          tone: "neutral",
        },
        {
          band: "above_expected",
          title: "Above expectations",
          description: `Over ${data.expectedHours} h this quarter.`,
          tone: "emerald",
        },
      ]
    : [];

  return (
    <InsightCard
      icon={GaugeIcon}
      title="Quarterly hours"
      description={
        data?.inProgress
          ? "Each active crew member's hours in the Stanford quarter (through the break after it), against the minimum and expected hours. The quarter is still underway, so shifts already scheduled through its end count toward the band. Summer is left out: Arbor is closed."
          : "Each active crew member's hours in the Stanford quarter (through the break after it), against the minimum and expected hours. Summer is left out: Arbor is closed."
      }
      testId="insights-crew-hours-bands"
    >
      <ToggleGroup
        type="single"
        size="sm"
        variant="outline"
        value={quarter.id}
        aria-label="Quarter"
        onValueChange={(next) => next && setQuarterId(next)}
      >
        {quarters.map((option) => (
          <ToggleGroupItem key={option.id} value={option.id}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      {data === undefined ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.crew.length === 0 ? (
        <EmptyState>No active crew to measure.</EmptyState>
      ) : (
        <>
          <ListSummary testId="crew-hours-bands-summary" order="Fewest hours first within each group.">
            {plural(data.crew.length, "crew member")} ·{" "}
            {groups
              .map((group) => `${data.crew.filter((row) => row.band === group.band).length} ${group.title.toLowerCase()}`)
              .join(" · ")}
          </ListSummary>
          <div className="space-y-3">
            {groups.map((group) => {
              const rows = data.crew.filter((row) => row.band === group.band);
              return (
                <RowGroup
                  key={group.band}
                  testId={`crew-hours-band-${group.band}`}
                  className="border"
                  title={group.title}
                  count={rows.length}
                  tone={group.tone}
                  description={group.description}
                >
                  {rows.length === 0 ? (
                    <li className="px-3 py-2.5 text-sm text-muted-foreground">Nobody in this group.</li>
                  ) : (
                    rows.map((row) => (
                      <ListRow key={row.userId} href={`/dashboard/users/timecards/${row.userId}`}>
                        <RowText
                          title={row.name}
                          detail={
                            data.inProgress && row.scheduledHours > 0
                              ? `${hours(row.workedHours)} worked · ${hours(row.scheduledHours)} scheduled`
                              : undefined
                          }
                        />
                        {group.band === "below_minimum" ? (
                          <RowCell className="w-28" hideBelow="sm" muted>
                            {hours(Math.max(0, data.minimumHours - row.totalHours))} short
                          </RowCell>
                        ) : null}
                        <RowCell className="w-20 font-medium">{hours(row.totalHours)}</RowCell>
                      </ListRow>
                    ))
                  )}
                </RowGroup>
              );
            })}
          </div>
        </>
      )}
    </InsightCard>
  );
}
