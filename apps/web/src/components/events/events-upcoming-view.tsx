"use client";

import Link from "next/link";
import { EventStateBadges, getDerivedLifecycleState } from "@/components/events/event-state-badges";
import { EmptyState, RowFlag, RowList, RowText } from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { Button } from "@/components/ui/button";

import { formatDateTime } from "@/lib/format";

type DashboardEvent = {
  _id: string;
  title: string;
  status: string;
  eventType?: string;
  venueName?: string;
  assignedCrewCount?: number;
  startAt: number;
  endAt: number;
  pullListSummary?: {
    totalLines: number;
    totalPieces: number;
  };
  scheduleSummary?: {
    setupAt?: number;
    showAt?: number;
    strikeAt?: number;
  };
};

export function EventsUpcomingView({ events }: { events: DashboardEvent[] }) {
  const upcoming = events
    .filter((row) => {
      const lifecycle = getDerivedLifecycleState({ status: row.status, startAt: row.startAt, endAt: row.endAt });
      return lifecycle === "upcoming" || lifecycle === "live" || lifecycle === "wrap";
    })
    .sort((a, b) => a.startAt - b.startAt);

  if (!upcoming.length) {
    return <EmptyState>No upcoming events found.</EmptyState>;
  }

  return (
    <RowList testId="events-upcoming-list">
      {upcoming.map((row) => (
        <ListRow
          key={row._id}
          href={`/dashboard/events/${row._id}`}
          data-testid={`events-upcoming-row-${row._id}`}
          actions={
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/events/${row._id}`}>Open</Link>
            </Button>
          }
        >
          <div className="min-w-0 flex-1 space-y-1">
            <RowText
              eyebrow={`${formatDateTime(row.startAt)} → ${formatDateTime(row.endAt)}`}
              title={row.title}
              detail={[row.eventType, row.venueName].filter(Boolean).join(" · ")}
            />
            <div className="flex flex-wrap items-center gap-2">
              <EventStateBadges status={row.status} startAt={row.startAt} endAt={row.endAt} />
              <RowFlag tone="neutral">Crew {row.assignedCrewCount ?? 0}</RowFlag>
              {row.pullListSummary && row.pullListSummary.totalLines > 0 ? (
                <RowFlag tone="neutral">
                  Pull list {row.pullListSummary.totalLines} · {row.pullListSummary.totalPieces} pcs
                </RowFlag>
              ) : null}
              {row.scheduleSummary?.setupAt ? (
                <RowFlag tone="neutral">Call {formatDateTime(row.scheduleSummary.setupAt)}</RowFlag>
              ) : null}
              {row.scheduleSummary?.showAt ? (
                <RowFlag tone="neutral">Show {formatDateTime(row.scheduleSummary.showAt)}</RowFlag>
              ) : null}
            </div>
          </div>
        </ListRow>
      ))}
    </RowList>
  );
}
