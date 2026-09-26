"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { EventStateBadges } from "@/components/events/event-state-badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ADMIN_CREW_SCHEDULING_DEFAULT_WEEKS,
  adminSchedulingRangeFromDateInputs,
  crewResponseBadgeClass,
  formatCrewResponseLabel,
  formatEventDateTime,
  getDefaultAdminSchedulingDateInputs,
} from "@/lib/crew-availability";
import { formatEventStatusLabel, normalizeEventStatus } from "@/lib/event-status";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

type CrewPerson = {
  userId: string;
  name: string;
  email: string;
  image?: string;
};

type PendingCrewRow = {
  pendingCrew: CrewPerson[];
};

function sortByName<T extends { name: string }>(people: T[]) {
  return [...people].sort((a, b) => a.name.localeCompare(b.name));
}

function PendingCrewSidebar({ rows }: { rows: PendingCrewRow[] | undefined }) {
  const entries = useMemo(() => {
    if (!rows) return [];
    const byUserId = new Map<string, CrewPerson & { count: number }>();
    for (const row of rows) {
      for (const person of row.pendingCrew) {
        const existing = byUserId.get(person.userId);
        if (existing) existing.count += 1;
        else byUserId.set(person.userId, { ...person, count: 1 });
      }
    }
    return [...byUserId.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    );
  }, [rows]);

  const totalPending = entries.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <div className="rounded-md border p-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Pending by crew</p>
        {totalPending > 0 ? (
          <span className="rounded-full border border-status-amber-500/30 bg-status-amber-500/15 px-2 py-0.5 text-xs tabular-nums text-status-amber-700">
            {totalPending}
          </span>
        ) : null}
      </div>
      {!rows ? (
        <p className="pt-3 text-xs text-muted-foreground">Loading...</p>
      ) : entries.length === 0 ? (
        <p className="pt-3 text-xs text-muted-foreground">No pending responses.</p>
      ) : (
        <ul className="space-y-1.5 pt-3">
          {entries.map((entry) => (
            <li key={entry.userId} className="flex items-center gap-2">
              <Avatar size="sm">
                <AvatarImage src={entry.image} alt={entry.name} />
                <AvatarFallback>{initials(entry.name)}</AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1 truncate text-sm">{entry.name}</span>
              <span className="rounded-full border border-status-amber-500/30 bg-status-amber-500/15 px-2 py-0.5 text-xs tabular-nums text-status-amber-700">
                {entry.count}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CrewSchedulingDashboard() {
  const defaultDates = useMemo(() => getDefaultAdminSchedulingDateInputs(), []);
  const [unconfirmedOnly, setUnconfirmedOnly] = useState(true);
  const [showPendingCrew, setShowPendingCrew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(defaultDates.startDate);
  const [endDate, setEndDate] = useState(defaultDates.endDate);

  const range = useMemo(
    () => adminSchedulingRangeFromDateInputs(startDate, endDate),
    [startDate, endDate],
  );

  const rows = useQuery(
    api.eventCrewAvailability.listForAdminOverview,
    range
      ? {
          rangeStart: range.rangeStart,
          rangeEnd: range.rangeEnd,
          unconfirmedOnly,
        }
      : "skip",
  );

  const kpis = useQuery(
    api.analyticsCrew.getCrewSchedulingKpis,
    range
      ? { startMs: range.rangeStart, endMs: range.rangeEnd }
      : "skip",
  );

  function resetToDefaultRange() {
    const defaults = getDefaultAdminSchedulingDateInputs();
    setStartDate(defaults.startDate);
    setEndDate(defaults.endDate);
  }

  function formatRate(value: number | null | undefined) {
    if (value == null || !Number.isFinite(value)) return "—";
    return `${(value * 100).toFixed(0)}%`;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-md border p-3">
        <p className="text-sm font-medium">Date range</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">From</p>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">To</p>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-40"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={resetToDefaultRange}>
            Next {ADMIN_CREW_SCHEDULING_DEFAULT_WEEKS} weeks
          </Button>
        </div>
        {!range ? (
          <p className="text-xs text-destructive">Choose a valid start and end date.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Showing crewed events overlapping {formatEventDateTime(range.rangeStart)} –{" "}
            {formatEventDateTime(range.rangeEnd)}.
          </p>
        )}
        {range && kpis !== undefined ? (
          <div className="grid gap-2 pt-1 sm:grid-cols-3">
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">Fill rate</p>
              <p className="text-sm font-semibold tabular-nums">{formatRate(kpis.fillRate)}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">Unfilled shifts</p>
              <p className="text-sm font-semibold tabular-nums">{kpis.unfilledShifts}</p>
            </div>
            <div className="rounded-md border px-3 py-2">
              <p className="text-xs text-muted-foreground">Unconfirmed events</p>
              <p className="text-sm font-semibold tabular-nums">{kpis.unconfirmedEvents}</p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border px-3 py-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unconfirmedOnly}
            onChange={(e) => setUnconfirmedOnly(e.target.checked)}
          />
          Unconfirmed only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showPendingCrew}
            onChange={(e) => setShowPendingCrew(e.target.checked)}
          />
          Show pending crew
        </label>
        <p className="text-xs text-muted-foreground sm:ml-auto">
          Crew confirmed when every shift slot has an assigned crew member.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="space-y-3">
          {!range ? null : !rows ? (
            <p className="text-sm text-muted-foreground">Loading crew scheduling...</p>
          ) : null}

          {range && rows && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {unconfirmedOnly
                ? "No unconfirmed crewed events in this date range."
                : "No crewed events found in this date range."}
            </p>
          ) : null}

          {rows?.map((row) => {
            const isExpanded = expandedId === row._id;
            const status = normalizeEventStatus(row.status);
            return (
              <div key={row._id} className="rounded-md border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{row.title}</p>
                      <EventStateBadges status={row.status} startAt={row.startAt} endAt={row.endAt} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatEventDateTime(row.startAt)} {" → "} {formatEventDateTime(row.endAt)}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs">
                      {row.eventType ? <span className="rounded bg-muted px-2 py-0.5">{row.eventType}</span> : null}
                      {row.venueName ? <span className="rounded bg-muted px-2 py-0.5">{row.venueName}</span> : null}
                      {row.host ? <span className="rounded bg-muted px-2 py-0.5">Host: {row.host}</span> : null}
                      <span className="rounded bg-muted px-2 py-0.5">
                        Status: {formatEventStatusLabel(status)}
                      </span>
                      {row.teamsInterested?.map((team) => (
                        <span key={team} className="rounded bg-muted px-2 py-0.5">
                          {team}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setExpandedId(isExpanded ? null : row._id)}
                    >
                      {isExpanded ? "Hide responses" : "Show responses"}
                    </Button>
                    <Button asChild variant="default" size="sm">
                      <Link href={`/dashboard/events/${row._id}/schedule`}>Assign crew</Link>
                    </Button>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">Shift assignment</p>
                    <p className="text-sm font-medium">
                      {row.filledShifts} / {row.totalShifts} filled
                    </p>
                    {row.unfilledShifts > 0 ? (
                      <p className="text-xs text-status-amber-700">{row.unfilledShifts} open slot(s)</p>
                    ) : row.totalShifts > 0 ? (
                      <p className="text-xs text-status-emerald-700">All slots assigned</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No shift slots defined yet</p>
                    )}
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">Available</p>
                    <p className="text-sm font-medium">
                      Yes {row.responseCounts.yes} · Partial {row.responseCounts.partial}
                    </p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">Unavailable / backup</p>
                    <p className="text-sm font-medium">
                      No {row.responseCounts.no} · Only if necessary {row.responseCounts.onlyIfNecessary}
                    </p>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-xs text-muted-foreground">Pending</p>
                    <p className="text-sm font-medium">
                      {row.responseCounts.pending} of {row.responseCounts.eligibleCrew} eligible
                    </p>
                  </div>
                </div>

                {showPendingCrew ? (
                  <div className="rounded-md border p-2">
                    <p className="mb-1 text-xs text-muted-foreground">
                      Still pending ({row.pendingCrew.length})
                    </p>
                    {row.pendingCrew.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Everyone has responded.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {sortByName(row.pendingCrew).map((person) => (
                          <span
                            key={person.userId}
                            className="flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs"
                          >
                            <Avatar size="sm">
                              <AvatarImage src={person.image} alt={person.name} />
                              <AvatarFallback>{initials(person.name)}</AvatarFallback>
                            </Avatar>
                            {person.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}

                {isExpanded ? (
                  <div className="space-y-3 rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium mb-2">Availability responses</p>
                      {row.responders.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No responses yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {row.responders.map((responder) => (
                            <div key={responder.userId} className="flex flex-wrap items-center gap-2 text-sm">
                              <Avatar size="sm">
                                <AvatarImage src={responder.image} alt={responder.name} />
                                <AvatarFallback>{initials(responder.name)}</AvatarFallback>
                              </Avatar>
                              <span>{responder.name}</span>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-xs ${crewResponseBadgeClass(responder.responseStatus)}`}
                              >
                                {formatCrewResponseLabel(responder.responseStatus)}
                              </span>
                              {responder.partialWindows?.map((window, index) => (
                                <span key={index} className="text-xs text-muted-foreground">
                                  {formatEventDateTime(window.startsAt)} – {formatEventDateTime(window.endsAt)}
                                </span>
                              ))}
                              {responder.notes ? (
                                <span className="text-xs text-muted-foreground italic">{responder.notes}</span>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">Assigned crew</p>
                      {row.assignedCrew.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No crew assigned to shifts yet.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {row.assignedCrew.map((member) => (
                            <div key={member.userId} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
                              <Avatar size="sm">
                                <AvatarImage src={member.image} alt={member.name} />
                                <AvatarFallback>{initials(member.name)}</AvatarFallback>
                              </Avatar>
                              <span>{member.name}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <PendingCrewSidebar rows={rows} />
      </div>
    </div>
  );
}
