"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  CalendarDotsIcon,
  CurrencyDollarIcon,
  StarIcon,
  TrendUpIcon,
  UsersThreeIcon,
  WrenchIcon,
  type Icon,
} from "@phosphor-icons/react";
import { PageTabs } from "@/components/page-header";
import {
  activeInsightsTabFromPathname,
  getInsightsTabPath,
  INSIGHTS_TAB_LABELS,
  INSIGHTS_TABS,
  type InsightsTabId,
} from "@/lib/insights-tabs";

const TAB_ICONS: Record<InsightsTabId, Icon> = {
  finances: CurrencyDollarIcon,
  demand: TrendUpIcon,
  events: CalendarDotsIcon,
  crew: UsersThreeIcon,
  ops: WrenchIcon,
  feedback: StarIcon,
};

/** Route tabs; each keeps the current date range in its link. */
export function InsightsTabNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = activeInsightsTabFromPathname(pathname);
  const query = searchParams.toString();

  return (
    <PageTabs
      label="Insights sections"
      tabs={INSIGHTS_TABS.map((tab) => ({
        href: `${getInsightsTabPath(tab)}${query ? `?${query}` : ""}`,
        label: INSIGHTS_TAB_LABELS[tab],
        icon: TAB_ICONS[tab],
        active: tab === active,
      }))}
    />
  );
}
