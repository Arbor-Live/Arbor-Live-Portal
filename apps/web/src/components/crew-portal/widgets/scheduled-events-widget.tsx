"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { CalendarDotsIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { DashboardWidget, WidgetRows } from "@/components/dashboard/dashboard-widget";
import { RowCell, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { formatDateTime } from "@/lib/format";

export function ScheduledEventsWidget() {
  const [now] = useState(() => Date.now());
  const events = useQuery(api.crewPortal.listMyScheduledEvents, { now, weeksAhead: 8 });

  return (
    <DashboardWidget icon={CalendarDotsIcon} title="Upcoming shifts" testId="home-upcoming-shifts">
      <WidgetRows loading={events === undefined} empty={events?.length === 0 ? "No upcoming assigned shifts." : null}>
        {events?.slice(0, 5).map((event) => (
          <ListRow key={event.eventId} href={`/dashboard/events/${event.eventId}`}>
            <RowText eyebrow={formatDateTime(event.startAt)} title={event.title} detail={event.venueName} />
            <RowCell className="w-16" muted>
              {event.shiftCount} shift{event.shiftCount === 1 ? "" : "s"}
            </RowCell>
          </ListRow>
        ))}
      </WidgetRows>
    </DashboardWidget>
  );
}
