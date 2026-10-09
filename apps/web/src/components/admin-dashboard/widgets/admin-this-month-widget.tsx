"use client";

import { useQuery } from "convex/react";
import { ChartLineIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { DashboardWidget, WidgetRows } from "@/components/dashboard/dashboard-widget";
import { RowCell, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { formatUsd } from "@/lib/format";

const INSIGHTS = "/dashboard/ops-center/insights";

function formatRate(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(0)}%`;
}

export function AdminThisMonthWidget() {
  const strip = useQuery(api.analyticsDemand.getThisMonthStrip, {});

  return (
    <DashboardWidget
      icon={ChartLineIcon}
      title="This month"
      link={{ href: INSIGHTS, label: "Insights" }}
      testId="home-this-month"
    >
      <WidgetRows loading={strip === undefined} empty={null}>
        {strip ? (
          <>
            <ListRow href={`${INSIGHTS}/events`}>
              <RowText title="Events" detail="Starting this month, not cancelled" />
              <RowCell className="w-24 font-semibold">{strip.eventsCount}</RowCell>
            </ListRow>
            <ListRow href={`${INSIGHTS}/demand`}>
              <RowText title="Conversion" detail="Requests booked, of those decided" />
              <RowCell className="w-24 font-semibold">{formatRate(strip.conversionRate)}</RowCell>
            </ListRow>
            <ListRow href={INSIGHTS}>
              <RowText title="Open AR" detail="Invoiced and not yet paid" />
              <RowCell className="w-24 font-semibold">{formatUsd(strip.openArUsd)}</RowCell>
            </ListRow>
          </>
        ) : null}
      </WidgetRows>
    </DashboardWidget>
  );
}
