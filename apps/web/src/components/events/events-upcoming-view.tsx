"use client";

import Link from "next/link";
import { EventStateBadges, getDerivedLifecycleState } from "@/components/events/event-state-badges";
import { Button } from "@/components/ui/button";

import { normalizeEventStatus } from "@/lib/event-status";

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

function formatDateTime(value: number) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function EventsUpcomingView({ events }: { events: DashboardEvent[] }) {
  const upcoming = events
    .filter((row) => {
      const lifecycle = getDerivedLifecycleState({ status: row.status, startAt: row.startAt, endAt: row.endAt });
      return lifecycle === "upcoming" || lifecycle === "live" || lifecycle === "wrap";
    })
    .sort((a, b) => a.startAt - b.startAt);

  if (!upcoming.length) {
    return <p className="text-sm text-muted-foreground">No upcoming events found.</p>;
  }

  return (
    <div className="space-y-2">
      {upcoming.map((row) => (
        <div key={row._id} className="rounded-md border p-3">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium">{row.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(row.startAt)} {"->"} {formatDateTime(row.endAt)}
              </p>
              <EventStateBadges status={row.status} startAt={row.startAt} endAt={row.endAt} />
              <div className="flex flex-wrap gap-2 text-xs">
                {row.eventType ? <span className="rounded bg-muted px-2 py-0.5">{row.eventType}</span> : null}
                {row.venueName ? <span className="rounded bg-muted px-2 py-0.5">{row.venueName}</span> : null}
                <span className="rounded bg-muted px-2 py-0.5">Crew {row.assignedCrewCount ?? 0}</span>
                {row.pullListSummary && row.pullListSummary.totalLines > 0 ? (
                  <span className="rounded bg-muted px-2 py-0.5">
                    Pull list {row.pullListSummary.totalLines} · {row.pullListSummary.totalPieces} pcs
                  </span>
                ) : null}
                {row.scheduleSummary?.setupAt ? (
                  <span className="rounded bg-muted px-2 py-0.5">Call {formatDateTime(row.scheduleSummary.setupAt)}</span>
                ) : null}
                {row.scheduleSummary?.showAt ? (
                  <span className="rounded bg-muted px-2 py-0.5">Show {formatDateTime(row.scheduleSummary.showAt)}</span>
                ) : null}
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href={`/dashboard/events/${row._id}`}>Open</Link>
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
