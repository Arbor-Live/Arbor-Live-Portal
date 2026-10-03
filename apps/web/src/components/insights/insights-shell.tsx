"use client";

import { usePathname, useRouter } from "next/navigation";
import { WarningCircleIcon } from "@phosphor-icons/react";
import { InsightsRangePicker } from "@/components/insights/insights-range-picker";
import { InsightsTabNav } from "@/components/insights/insights-tab-nav";
import { useInsightsRange } from "@/components/insights/use-insights-range";
import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { insightsSelectionToSearch } from "@/lib/insights-range";

/** Header, range and tabs around the active Insights tab (a route under this layout). */
export function InsightsShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { selection, range } = useInsightsRange();

  return (
    <div className="space-y-4 pb-24" data-testid="insights-page">
      <PageHeader
        title="Insights"
        description="How the business is doing: money, demand, events, crew and operations. Range-based numbers follow the dates below; forward-looking ones say so."
      >
        <InsightsRangePicker
          value={selection}
          onChange={(next) => router.replace(`${pathname}${insightsSelectionToSearch(next)}`, { scroll: false })}
        />
      </PageHeader>
      <InsightsTabNav />
      {range ? (
        children
      ) : (
        <Alert variant="destructive">
          <WarningCircleIcon />
          <AlertDescription>The end date is before the start date. Pick a valid range.</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
