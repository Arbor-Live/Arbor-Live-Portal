"use client";

import { useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { InsightsCrewPanel } from "@/components/insights/insights-crew-panel";
import { InsightsDemandPanel } from "@/components/insights/insights-demand-panel";
import { InsightsEventsPanel } from "@/components/insights/insights-events-panel";
import { InsightsFinancesPanel } from "@/components/insights/insights-finances-panel";
import { InsightsOpsPanel } from "@/components/insights/insights-ops-panel";
import { InsightsRangePicker } from "@/components/insights/insights-range-picker";
import { InsightsTabNav, type InsightsTabId } from "@/components/insights/insights-tab-nav";
import { getDefaultInsightsDateInputs, insightsRangeFromDateInputs } from "@/lib/insights-range";

export function InsightsPageClient() {
  const defaults = useMemo(() => getDefaultInsightsDateInputs(), []);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [tab, setTab] = useState<InsightsTabId>("finances");

  const range = useMemo(
    () => insightsRangeFromDateInputs(startDate, endDate),
    [startDate, endDate],
  );

  return (
    <div className="space-y-4" data-testid="insights-page">
      <Card>
        <CardHeader>
          <CardTitle>Insights</CardTitle>
          <CardDescription>
            Trends in Pacific Time across finances, demand, events, crew, and ops — including
            upcoming calendar readiness — complements the operational queues.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <InsightsRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
          />
          <InsightsTabNav value={tab} onChange={setTab} />
          {!range ? (
            <p className="text-sm text-destructive">Choose a valid From / To range.</p>
          ) : null}
        </CardContent>
      </Card>

      {range && tab === "finances" ? (
        <div data-testid="insights-finances-panel">
          <InsightsFinancesPanel startMs={range.startMs} endMs={range.endMs} />
        </div>
      ) : null}
      {range && tab === "demand" ? (
        <div data-testid="insights-demand-panel">
          <InsightsDemandPanel startMs={range.startMs} endMs={range.endMs} />
        </div>
      ) : null}
      {range && tab === "events" ? (
        <InsightsEventsPanel startMs={range.startMs} endMs={range.endMs} />
      ) : null}
      {range && tab === "crew" ? (
        <div data-testid="insights-crew-panel">
          <InsightsCrewPanel startMs={range.startMs} endMs={range.endMs} />
        </div>
      ) : null}
      {range && tab === "ops" ? (
        <InsightsOpsPanel startMs={range.startMs} endMs={range.endMs} />
      ) : null}
    </div>
  );
}
