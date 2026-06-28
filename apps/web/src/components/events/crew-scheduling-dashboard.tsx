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

export function CrewSchedulingDashboard() {
  const defaultDates = useMemo(() => getDefaultAdminSchedulingDateInputs(), []);
  const [unconfirmedOnly, setUnconfirmedOnly] = useState(true);
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

  function resetToDefaultRange() {
    const defaults = getDefaultAdminSchedulingDateInputs();
    setStartDate(defaults.startDate);
    setEndDate(defaults.endDate);
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
              className="w-[160px]"
            />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">To</p>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-[160px]"
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
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
          <input
            type="checkbox"
            checked={unconfirmedOnly}
            onChange={(e) => setUnconfirmedOnly(e.target.checked)}
          />
          Unconfirmed only
        </label>
        <p className="text-xs text-muted-foreground">
          Crew confirmed when every shift slot has an assigned crew member.
        </p>
      </div>

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
                  <p className="text-xs text-amber-700">{row.unfilledShifts} open slot(s)</p>
                ) : row.totalShifts > 0 ? (
                  <p className="text-xs text-emerald-700">All slots assigned</p>
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
  );
}
