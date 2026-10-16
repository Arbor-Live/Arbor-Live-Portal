"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { CalendarCheckIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { DashboardWidget, WidgetRows } from "@/components/dashboard/dashboard-widget";
import { RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { nightDateLabel } from "@/lib/crew-nights";

const HREF = "/dashboard/events/my-availability";

export function PendingAvailabilityWidget() {
  const [now] = useState(() => Date.now());
  const nights = useQuery(api.crewPortal.listMyPendingAvailability, { now });

  return (
    <DashboardWidget
      icon={CalendarCheckIcon}
      title="Availability"
      link={{ href: HREF, label: "View all" }}
      testId="home-pending-availability"
      summary={
        nights && nights.length > 0
          ? `${nights.length} night${nights.length === 1 ? "" : "s"} to answer · soonest first`
          : null
      }
    >
      <WidgetRows loading={nights === undefined} empty={nights?.length === 0 ? "Every night has an answer." : null}>
        {nights?.slice(0, 5).map((night) => (
          <ListRow key={night.nightKey} href={HREF}>
            <RowText
              title={nightDateLabel(night.nightKey)}
              detail={night.events.map((event) => event.title).join(", ")}
            />
          </ListRow>
        ))}
      </WidgetRows>
    </DashboardWidget>
  );
}
