"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { CalendarCheckIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { DashboardWidget, WidgetRows } from "@/components/dashboard/dashboard-widget";
import { RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { formatDateTimeRange } from "@/lib/format";

const HREF = "/dashboard/events/my-availability";

export function PendingAvailabilityWidget() {
  const [now] = useState(() => Date.now());
  const events = useQuery(api.crewPortal.listMyPendingAvailability, { now });

  return (
    <DashboardWidget
      icon={CalendarCheckIcon}
      title="Availability"
      link={{ href: HREF, label: "View all" }}
      testId="home-pending-availability"
      summary={events && events.length > 0 ? `${events.length} waiting on your reply · soonest first` : null}
    >
      <WidgetRows loading={events === undefined} empty={events?.length === 0 ? "No pending availability requests." : null}>
        {events?.slice(0, 5).map((event) => (
          <ListRow key={event._id} href={HREF}>
            <RowText title={event.title} detail={formatDateTimeRange(event.startAt, event.endAt)} />
          </ListRow>
        ))}
      </WidgetRows>
    </DashboardWidget>
  );
}
