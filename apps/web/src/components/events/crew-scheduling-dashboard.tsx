"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { WarningIcon } from "@phosphor-icons/react";
import { EventStateBadges } from "@/components/events/event-state-badges";
import { TypeChip } from "@/components/events/workspace/run-of-show/run-of-show-styles";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePickerField } from "@/components/ui/date-picker";
import { EmptyState } from "@/components/list-page";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademicPeriodPicks } from "@/components/academic-period-picks";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ADMIN_CREW_SCHEDULING_DEFAULT_WEEKS,
  adminSchedulingRangeFromDateInputs,
  crewResponseBadgeClass,
  formatCrewResponseLabel,
  formatEventDateTime,
  formatTimeWindow,
  getDefaultAdminSchedulingDateInputs,
  parseLocalDateInput,
  toLocalDateInput,
} from "@/lib/crew-availability";
import { formatDateTimeRange } from "@/lib/format";
import type { ScheduleBlockType } from "@/lib/schedule-block-types";
import { cn } from "@/lib/utils";
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
        <p className="text-sm font-medium">Waiting on answers</p>
        {totalPending > 0 ? (
          <span className="rounded-full border border-status-amber-500/30 bg-status-amber-500/15 px-2 py-0.5 text-xs tabular-nums text-status-amber-700">
            {totalPending}
          </span>
        ) : null}
      </div>
      {!rows ? (
        <p className="pt-3 text-xs text-muted-foreground">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="pt-3 text-xs text-muted-foreground">Everyone has answered.</p>
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

type BoardRow = NonNullable<
  ReturnType<typeof useQuery<typeof api.eventCrewAvailability.listForAdminOverview>>
>[number];
type Responder = BoardRow["responders"][number];

const RESPONSE_ORDER: Record<Responder["responseStatus"], number> = {
  yes: 0,
  partial: 1,
  only_if_necessary: 2,
  no: 3,
};

function SectionStaffingStrip({ row }: { row: BoardRow }) {
  if (row.sections.length === 0) {
    return <p className="text-xs text-muted-foreground">No crew sections on the run of show yet.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="crew-board-sections">
      {row.sections.map((section) => {
        const tone =
          section.slots === 0
            ? "border-border text-muted-foreground"
            : section.filled < section.slots || section.backup > 0
              ? "border-status-amber-500/40 bg-status-amber-500/10 text-status-amber-700"
              : "border-status-emerald-500/40 bg-status-emerald-500/10 text-status-emerald-700";
        return (
          <span
            key={section._id}
            className={cn("inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs", tone)}
            title={formatDateTimeRange(section.startsAt, section.endsAt)}
          >
            <TypeChip type={section.blockType as ScheduleBlockType} />
            <span className="max-w-32 truncate">{section.label}</span>
            <span className="tabular-nums">
              {section.slots === 0 ? "no slots" : `${section.filled}/${section.slots}`}
              {section.backup > 0 ? ` · ${section.backup} backup` : null}
            </span>
          </span>
        );
      })}
      {row.traineeCount > 0 ? (
        <span className="text-xs text-muted-foreground">
          + {row.traineeCount} trainee{row.traineeCount === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>
  );
}

function responderDetail(responder: Responder, sectionLabelById: Map<string, string>) {
  const parts: string[] = [];
  if (responder.responseStatus === "partial") {
    const picked = (responder.partialWindows ?? [])
      .map((window) =>
        window.scheduleBlockId
          ? sectionLabelById.get(window.scheduleBlockId) ?? "a removed section"
          : `free ${formatTimeWindow(window)}`,
      );
    if (picked.length > 0) parts.push(`Can do ${picked.join(", ")}`);
  }
  for (const window of responder.busyWindows ?? []) {
    parts.push(`busy ${formatTimeWindow(window)}${window.notes ? ` (${window.notes})` : ""}`);
  }
  return parts.join(" · ");
}

function ResponsesList({ row }: { row: BoardRow }) {
  const sectionLabelById = new Map(row.sections.map((section) => [section._id as string, section.label]));
  const assigned = new Set(row.assignedCrew.map((member) => member.userId));
  const responders = [...row.responders].sort(
    (a, b) => RESPONSE_ORDER[a.responseStatus] - RESPONSE_ORDER[b.responseStatus] || a.name.localeCompare(b.name),
  );
  return (
    <div className="space-y-2 border p-3">
      <p className="text-sm font-medium">Answers</p>
      {responders.length === 0 ? (
        <p className="text-xs text-muted-foreground">No answers yet.</p>
      ) : (
        <ul className="divide-y">
          {responders.map((responder) => {
            const detail = responderDetail(responder, sectionLabelById);
            return (
              <li key={responder.userId} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                <Avatar size="sm">
                  <AvatarImage src={responder.image} alt={responder.name} />
                  <AvatarFallback>{initials(responder.name)}</AvatarFallback>
                </Avatar>
                <span className="font-medium">{responder.name}</span>
                <span
                  className={`rounded-md border px-2 py-0.5 text-xs ${crewResponseBadgeClass(responder.responseStatus)}`}
                >
                  {formatCrewResponseLabel(responder.responseStatus)}
                </span>
                {assigned.has(responder.userId) ? (
                  <span className="text-xs text-status-emerald-700">On the crew</span>
                ) : null}
                {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
                {responder.notes ? (
                  <span className="text-xs text-muted-foreground italic">“{responder.notes}”</span>
                ) : null}
                {responder.scheduleChanged ? (
                  <span className="inline-flex items-center gap-1 text-xs text-status-amber-700">
                    <WarningIcon className="size-3.5" weight="fill" aria-hidden />
                    answered before the schedule changed
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day key (`2026-02-30` isn't one). */
function isDateKey(value: string | null): value is string {
  if (!value || !DATE_KEY.test(value)) return false;
  const parsed = parseLocalDateInput(value);
  return parsed !== null && toLocalDateInput(parsed) === value;
}

export function CrewSchedulingDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [defaults] = useState(() => getDefaultAdminSchedulingDateInputs());
  const [needsCrewOnly, setNeedsCrewOnly] = useState(true);
  const [showPendingCrew, setShowPendingCrew] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  // The range lives in `?from=YYYY-MM-DD&to=YYYY-MM-DD` (Insights links here),
  // so back/forward and shared links always match what's shown.
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  // Both ends or neither: one bad day falls back to the whole default range,
  // not half of it (which could leave a range ending before it starts).
  const fromUrl = isDateKey(fromParam) && isDateKey(toParam);
  const startDate = fromUrl ? fromParam : defaults.startDate;
  const endDate = fromUrl ? toParam : defaults.endDate;

  function setRange(nextStart: string, nextEnd: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", nextStart);
    params.set("to", nextEnd);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }
  const setStartDate = (next: string) => setRange(next, endDate);
  const setEndDate = (next: string) => setRange(startDate, next);

  // A range ending before it starts is invalid: say so and skip the queries.
  const range = useMemo(() => {
    const candidate = adminSchedulingRangeFromDateInputs(startDate, endDate);
    return candidate && candidate.rangeEnd >= candidate.rangeStart ? candidate : null;
  }, [startDate, endDate]);

  const rows = useQuery(
    api.eventCrewAvailability.listForAdminOverview,
    range
      ? {
          rangeStart: range.rangeStart,
          rangeEnd: range.rangeEnd,
          unconfirmedOnly: needsCrewOnly,
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
    setRange(defaults.startDate, defaults.endDate);
  }

  function formatRate(value: number | null | undefined) {
    if (value == null || !Number.isFinite(value)) return "—";
    return `${(value * 100).toFixed(0)}%`;
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2 border p-3">
        <p className="text-sm font-medium">Date range</p>
        <div className="flex flex-wrap items-center gap-2">
          <DatePickerField
            id="crew-scheduling-from"
            aria-label="From"
            value={startDate}
            onChange={(next) => next && setStartDate(next)}
            placeholder="From"
            className="w-48"
          />
          <span className="text-sm text-muted-foreground">to</span>
          <DatePickerField
            id="crew-scheduling-to"
            aria-label="To"
            value={endDate}
            onChange={(next) => next && setEndDate(next)}
            placeholder="To"
            className="w-48"
          />
          <Button type="button" variant="outline" size="sm" onClick={resetToDefaultRange}>
            Next {ADMIN_CREW_SCHEDULING_DEFAULT_WEEKS} weeks
          </Button>
          <AcademicPeriodPicks
            presets={["this-quarter", "next-quarter"]}
            startDate={startDate}
            endDate={endDate}
            onSelect={(period) => setRange(period.startDate, period.endDate)}
          />
        </div>
        {!range ? (
          <p className="text-xs text-destructive">Choose a valid start and end date.</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Crewed events overlapping {formatEventDateTime(range.rangeStart)} –{" "}
            {formatEventDateTime(range.rangeEnd)}.
          </p>
        )}
        {range && kpis !== undefined ? (
          <div className="grid gap-2 pt-1 sm:grid-cols-3">
            <div className="border px-3 py-2">
              <p className="text-xs text-muted-foreground">Slots filled</p>
              <p className="text-sm font-semibold tabular-nums">{formatRate(kpis.fillRate)}</p>
            </div>
            <div className="border px-3 py-2">
              <p className="text-xs text-muted-foreground">Open slots</p>
              <p className="text-sm font-semibold tabular-nums">{kpis.unfilledShifts}</p>
              {kpis.backupShifts > 0 ? (
                <p className="text-xs text-muted-foreground">{kpis.backupShifts} more on backup</p>
              ) : null}
            </div>
            <div className="border px-3 py-2">
              <p className="text-xs text-muted-foreground">Events needing crew</p>
              <p className="text-sm font-semibold tabular-nums">{kpis.unconfirmedEvents}</p>
              {kpis.noSlotEvents > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {kpis.noSlotEvents} with no slots yet
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border px-3 py-2">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={needsCrewOnly}
            onCheckedChange={(checked) => setNeedsCrewOnly(checked === true)}
          />
          Needs crew only
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={showPendingCrew}
            onCheckedChange={(checked) => setShowPendingCrew(checked === true)}
          />
          Show who hasn&apos;t answered
        </label>
        <p className="text-xs text-muted-foreground sm:ml-auto">
          An event needs crew until every slot on every section has someone. Trainees don&apos;t count.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-3">
          {!range ? null : !rows ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : null}

          {range && rows && rows.length === 0 ? (
            <EmptyState>
              {needsCrewOnly
                ? "Every crewed event in this range is fully staffed."
                : "No crewed events found in this date range."}
            </EmptyState>
          ) : null}

          {rows?.map((row) => {
            const isExpanded = expandedId === row._id;
            const status = normalizeEventStatus(row.status);
            const counts = row.responseCounts;
            return (
              <div key={row._id} className="space-y-3 border p-4" data-testid="crew-board-event">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{row.title}</p>
                      <EventStateBadges status={row.status} startAt={row.startAt} endAt={row.endAt} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTimeRange(row.startAt, row.endAt)}
                      {row.venueName ? ` · ${row.venueName}` : ""}
                      {row.host ? ` · ${row.host}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {row.eventType ? <span className="bg-muted px-2 py-0.5">{row.eventType}</span> : null}
                      <span className="bg-muted px-2 py-0.5">{formatEventStatusLabel(status)}</span>
                      {row.teamsInterested?.map((team) => (
                        <span key={team} className="bg-muted px-2 py-0.5">
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
                      {isExpanded ? "Hide answers" : "Show answers"}
                    </Button>
                    <Button asChild variant="default" size="sm">
                      <Link href={`/dashboard/events/${row._id}/schedule`}>Assign crew</Link>
                    </Button>
                  </div>
                </div>

                <SectionStaffingStrip row={row} />

                <p className="text-sm" data-testid="crew-board-availability">
                  <span className="text-muted-foreground">Availability: </span>
                  Yes {counts.yes} · Part {counts.partial} · Backup {counts.onlyIfNecessary} · No {counts.no}
                  <span className={cn(counts.pending > 0 ? "text-status-amber-700" : "text-muted-foreground")}>
                    {" "}
                    · waiting on {counts.pending} of {counts.eligibleCrew}
                  </span>
                </p>

                {showPendingCrew && row.pendingCrew.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {sortByName(row.pendingCrew).map((person) => (
                      <span
                        key={person.userId}
                        className="flex items-center gap-1.5 border px-1.5 py-0.5 text-xs"
                      >
                        <Avatar size="sm">
                          <AvatarImage src={person.image} alt={person.name} />
                          <AvatarFallback>{initials(person.name)}</AvatarFallback>
                        </Avatar>
                        {person.name}
                      </span>
                    ))}
                  </div>
                ) : null}

                {isExpanded ? <ResponsesList row={row} /> : null}
              </div>
            );
          })}
        </div>

        <PendingCrewSidebar rows={rows} />
      </div>
    </div>
  );
}
