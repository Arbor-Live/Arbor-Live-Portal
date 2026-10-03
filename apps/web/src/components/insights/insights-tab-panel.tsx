"use client";

import { InsightsCrewPanel } from "@/components/insights/insights-crew-panel";
import { InsightsDemandPanel } from "@/components/insights/insights-demand-panel";
import { InsightsEventsPanel } from "@/components/insights/insights-events-panel";
import { InsightsFeedbackPanel } from "@/components/insights/insights-feedback-panel";
import { InsightsFinancesPanel } from "@/components/insights/insights-finances-panel";
import { InsightsOpsPanel } from "@/components/insights/insights-ops-panel";
import { InsightsPostMortemPanel } from "@/components/insights/insights-postmortem-panel";
import { InsightSection } from "@/components/insights/insights-ui";
import { useInsightsRange } from "@/components/insights/use-insights-range";
import type { InsightsTabId } from "@/lib/insights-tabs";

/** The active tab's panel, fed the URL's range (the shell explains an invalid one). */
export function InsightsTabPanel({ tab }: { tab: InsightsTabId }) {
  const { range } = useInsightsRange();
  if (!range) return null;
  const { startMs, endMs } = range;
  switch (tab) {
    case "finances":
      return <InsightsFinancesPanel startMs={startMs} endMs={endMs} />;
    case "demand":
      return <InsightsDemandPanel startMs={startMs} endMs={endMs} />;
    case "events":
      return <InsightsEventsPanel startMs={startMs} endMs={endMs} />;
    case "crew":
      return <InsightsCrewPanel startMs={startMs} endMs={endMs} />;
    case "ops":
      return <InsightsOpsPanel startMs={startMs} endMs={endMs} />;
    case "feedback":
      return (
        <div className="space-y-6">
          <InsightSection title="Client feedback" description="What hosts told us after their events.">
            <InsightsFeedbackPanel startMs={startMs} endMs={endMs} />
          </InsightSection>
          <InsightSection title="Crew post-mortems" description="Reviews from crew and leads who worked the show.">
            <InsightsPostMortemPanel startMs={startMs} endMs={endMs} />
          </InsightSection>
        </div>
      );
  }
}
