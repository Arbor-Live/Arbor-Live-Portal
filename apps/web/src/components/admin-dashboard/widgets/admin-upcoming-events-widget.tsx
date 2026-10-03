"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { CalendarDotsIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { DashboardWidget, WidgetRows } from "@/components/dashboard/dashboard-widget";
import { RowCell, RowFlag, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { StatusPill } from "@/components/page-header";
import { eventStatusBadgeTone, formatEventStatusLabel, normalizeEventStatus } from "@/lib/event-status";
import { formatDateTime } from "@/lib/format";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * Upcoming events with what each still needs, so an event shows up once:
 * every event needing crew in the crewing window, then the soonest others.
 */
export function AdminUpcomingEventsWidget() {
  const [now] = useState(() => Date.now());
  const data = useQuery(api.dashboardHome.listUpcomingAdminEvents, { now, limit: 6 });
  const events = data?.events ?? [];

  return (
    <DashboardWidget
      icon={CalendarDotsIcon}
      title="Upcoming events"
      link={{ href: "/dashboard/events", label: "All events" }}
      testId="home-upcoming-events"
      summary={
        data ? (
          <>
            {plural(data.windowEventCount, "event")} in the next {data.windowWeeks} weeks ·{" "}
            {data.needsCrewCount === 0 ? (
              "all crewed"
            ) : (
              <Link href="/dashboard/events/crew-scheduling" className="text-foreground underline-offset-2 hover:underline">
                {data.needsCrewCount} need crew
              </Link>
            )}
          </>
        ) : null
      }
    >
      <WidgetRows
        loading={data === undefined}
        empty={events.length === 0 ? "No upcoming events are scheduled." : null}
        testId="home-upcoming-events-list"
      >
        {events.map((event) => {
          const status = normalizeEventStatus(event.status);
          const flags = [
            event.needsCrew ? (
              <RowFlag key="crew">
                {event.totalShifts === 0 ? "No crew slots" : plural(event.unfilledShifts, "open slot")}
              </RowFlag>
            ) : null,
            event.needsCrew && event.awaitingReplies > 0 ? (
              <RowFlag key="replies" tone="neutral">
                Waiting on {event.awaitingReplies}
              </RowFlag>
            ) : null,
            event.missingInvoice ? <RowFlag key="quote">No quote</RowFlag> : null,
            event.missingLead ? <RowFlag key="lead">No day-of lead</RowFlag> : null,
          ].filter(Boolean);
          return (
            <ListRow
              key={event._id}
              data-testid={`home-upcoming-event-${event._id}`}
              href={`/dashboard/events/${event._id}${event.needsCrew ? "/schedule" : ""}`}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <RowText
                  eyebrow={formatDateTime(event.startAt)}
                  title={event.title}
                  detail={[
                    event.venueName,
                    event.crewed && event.totalShifts > 0 ? `${plural(event.assignedCrewCount, "crew")} assigned` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                />
                {flags.length > 0 ? <div className="flex flex-wrap gap-1">{flags}</div> : null}
              </div>
              <RowCell className="w-24" hideBelow="md">
                <StatusPill tone={eventStatusBadgeTone(status)} className="h-6">
                  {formatEventStatusLabel(status)}
                </StatusPill>
              </RowCell>
            </ListRow>
          );
        })}
      </WidgetRows>
    </DashboardWidget>
  );
}
