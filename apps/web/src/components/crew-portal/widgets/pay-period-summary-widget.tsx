"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { ClockIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { DashboardWidget, WidgetRows } from "@/components/dashboard/dashboard-widget";
import { RowCell, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { formatDate } from "@/lib/format";

const HREF = "/dashboard/timecards/mine";

export function PayPeriodSummaryWidget() {
  const [now] = useState(() => Date.now());
  const periods = useQuery(api.crewPortal.getMyPayPeriodSummary, { now });

  return (
    <DashboardWidget icon={ClockIcon} title="Pay periods" link={{ href: HREF, label: "Timecards" }} testId="home-pay-periods">
      <WidgetRows loading={periods === undefined} empty={periods?.length === 0 ? "No recent pay periods." : null}>
        {periods?.map((period) => (
          <ListRow key={period.label} href={HREF}>
            <RowText title={period.label} detail={`Due ${formatDate(period.dueMs)}`} />
            <RowCell className="w-20">
              {period.daysWorked} day{period.daysWorked === 1 ? "" : "s"}
            </RowCell>
          </ListRow>
        ))}
      </WidgetRows>
    </DashboardWidget>
  );
}
