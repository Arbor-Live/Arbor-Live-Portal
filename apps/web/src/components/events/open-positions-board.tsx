"use client";

import {
  FilterBar,
  matchesFilter,
  type FilterDefinition,
  type FilterState,
} from "@/components/filter-bar";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChatCircleIcon, UserCircleIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { useSessionShell, useSessionViewer } from "@/components/session-shell-provider";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { assignableCrewSelectOptions } from "@/lib/user-select-description";
import { TYPE_OPTIONS } from "@/components/events/lineup/lineup-model";
import { getEventEditorTabPath } from "@/lib/event-editor-tabs";
import { academicPeriod, periodMsRange } from "@/lib/academic-periods";
import { formatDate, formatTime, pacificDateKey } from "@/lib/format";
import { cn } from "@/lib/utils";

const DAY_MS = 24 * 60 * 60 * 1000;

const RANGES = {
  "14": { label: "2 weeks", days: 14 },
  "30": { label: "30 days", days: 30 },
  "90": { label: "90 days", days: 90 },
  "this-quarter": { label: "This quarter", days: null },
  "next-quarter": { label: "Next quarter", days: null },
  all: { label: "All upcoming", days: Number.POSITIVE_INFINITY },
} as const;
type RangeKey = keyof typeof RANGES;

/** Shows starting in `[from, until]` for a range; quarters follow Stanford's calendar. */
function rangeWindow(range: RangeKey, now: number): { from: number; until: number } | null {
  const days = RANGES[range].days;
  if (days !== null) return { from: Number.NEGATIVE_INFINITY, until: now + days * DAY_MS };
  const period = academicPeriod(range as "this-quarter" | "next-quarter", pacificDateKey(now));
  if (!period) return null;
  const { startMs, endMs } = periodMsRange(period);
  return { from: startMs, until: endMs };
}

const INQUIRY_OPTIONS = [
  { value: "some", label: "Has inquiries" },
  { value: "none", label: "No inquiries yet" },
];

const TYPE_LABELS = new Map(TYPE_OPTIONS.map((option) => [option.value, option.label]));

/** Days until the show: red inside a week, amber inside three. */
function countdown(startAt: number, now: number) {
  const days = Math.max(0, Math.ceil((startAt - now) / DAY_MS));
  const label = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  const tone =
    days < 7
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : days < 21
        ? "border-status-amber-500/40 bg-status-amber-500/10 text-status-amber-700 dark:text-status-amber-300"
        : "border-border text-muted-foreground";
  return { label, tone };
}

/**
 * Logistics view: every upcoming position no act fills yet, grouped by event
 * and soonest first, each linking to its side panel on the event's Lineup. The
 * operations lead — who owns filling the lineup — is assigned inline here.
 */
export function OpenPositionsBoard() {
  const result = useQuery(api.eventArtistNeeds.listOpenPositions, {});
  const events = result?.events;
  const managerList = useQuery(api.invoices.listManagers, {});
  const setOperationsLead = useMutation(api.events.setOperationsLead);
  const shell = useSessionShell();
  const viewer = useSessionViewer();
  const account = shell?.account;
  const viewerUserId = viewer?.userId;
  const [range, setRange] = useState<RangeKey>("30");
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<FilterState>({});
  const [assignedToMe, setAssignedToMe] = useState(false);
  // Value shown until the server query catches up with an assigned lead.
  const [leadOverrides, setLeadOverrides] = useState<Record<string, string>>({});
  const [now] = useState(() => Date.now());

  const userSelectOptions: UserSelectOption[] = useMemo(() => {
    const base = assignableCrewSelectOptions(
      managerList,
      viewerUserId
        ? {
            id: viewerUserId,
            name: account?.name ?? account?.email ?? "Current user",
            email: account?.email,
            avatarUrl: account?.avatarUrl,
            image: account?.image,
          }
        : null,
    );
    // Keep a stored lead visible even after they stop being assignable crew.
    const known = new Set(base.map((option) => option.value));
    const extras: UserSelectOption[] = [];
    for (const event of events ?? []) {
      const leadId = event.operationsLeadUserId;
      if (!leadId || known.has(leadId)) continue;
      known.add(leadId);
      extras.push({ value: leadId, label: event.operationsLeadName ?? "Unknown user" });
    }
    return extras.length ? [...base, ...extras].sort((a, b) => a.label.localeCompare(b.label)) : base;
  }, [account, events, managerList, viewerUserId]);

  function leadFor(eventId: string, storedLeadId: string | undefined) {
    return leadOverrides[eventId] ?? storedLeadId ?? "";
  }

  async function changeLead(eventId: Id<"events">, value: string) {
    setLeadOverrides((prev) => ({ ...prev, [eventId]: value }));
    try {
      await setOperationsLead({ id: eventId, operationsLeadUserId: value || null });
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setLeadOverrides((prev) => {
        const next = { ...prev };
        delete next[eventId];
        return next;
      });
    }
  }

  const filterDefinitions = useMemo<FilterDefinition[]>(
    () => [
      { id: "type", label: "Artist type", options: TYPE_OPTIONS.map((option) => ({ ...option })) },
      {
        id: "venue",
        label: "Venue",
        options: [...new Set((events ?? []).map((event) => event.venueName).filter((name): name is string => Boolean(name)))]
          .sort((a, b) => a.localeCompare(b))
          .map((name) => ({ value: name, label: name })),
      },
      { id: "inquiries", label: "Inquiries", options: INQUIRY_OPTIONS, single: true },
    ],
    [events],
  );

  const visible = useMemo(() => {
    if (!events) return [];
    const window = rangeWindow(range, now);
    if (!window) return [];
    const needles = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return events.flatMap((event) => {
      if (event.startAt < window.from || event.startAt > window.until) return [];
      const lead = leadOverrides[event.eventId] ?? event.operationsLeadUserId ?? "";
      if (assignedToMe && lead !== viewerUserId) return [];
      if (!matchesFilter(filters.venue, event.venueName ?? "")) return [];
      const positions = event.openPositions.filter((position) => {
        if (!matchesFilter(filters.type, position.artistType)) return false;
        if (!matchesFilter(filters.inquiries, position.inquiryCount > 0 ? "some" : "none")) return false;
        if (needles.length === 0) return true;
        const haystack = [
          event.title,
          event.venueName,
          position.label,
          position.genres,
          TYPE_LABELS.get(position.artistType),
        ]
          .join(" ")
          .toLowerCase();
        return needles.every((needle) => haystack.includes(needle));
      });
      // Filled is counted before search narrows the open positions.
      const filled = event.totalPositions - event.openPositions.length;
      return positions.length ? [{ ...event, filled, openPositions: positions }] : [];
    });
  }, [assignedToMe, events, filters, leadOverrides, now, range, search, viewerUserId]);

  const openCount = visible.reduce((total, event) => total + event.openPositions.length, 0);
  const withInquiries = visible.reduce(
    (total, event) => total + event.openPositions.filter((position) => position.inquiryCount > 0).length,
    0,
  );

  return (
    <div className="space-y-4" data-testid="open-positions">
      <FilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search events, venues, genres"
        searchLabel="Search open positions"
        filters={filterDefinitions}
        value={filters}
        onChange={setFilters}
      >
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={range}
          onValueChange={(value) => value && setRange(value as RangeKey)}
          aria-label="Date range"
        >
          {(Object.keys(RANGES) as RangeKey[]).filter((key) => rangeWindow(key, now)).map((key) => (
            <ToggleGroupItem key={key} value={key}>
              {RANGES[key].label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Toggle
          variant="outline"
          size="sm"
          pressed={assignedToMe}
          onPressedChange={setAssignedToMe}
          aria-label="Show only events assigned to me"
        >
          Assigned to me
        </Toggle>
      </FilterBar>

      {events === undefined ? (
        <p className="text-sm text-muted-foreground">Loading open positions…</p>
      ) : (
        <p className="text-sm text-muted-foreground" data-testid="open-positions-summary">
          {openCount === 0
            ? assignedToMe
              ? "No open positions assigned to you in this range."
              : "Every position in this range is filled."
            : `${openCount} open position${openCount === 1 ? "" : "s"} across ${visible.length} event${
                visible.length === 1 ? "" : "s"
              }${withInquiries ? ` · ${withInquiries} with inquiries to review` : ""}`}
        </p>
      )}
      {result?.truncated ? (
        <p className="text-sm text-status-amber-700 dark:text-status-amber-300">
          Not every upcoming event could be checked, so some open positions may be missing from this
          list.
        </p>
      ) : null}

      <div className="space-y-3">
        {visible.map((event) => {
          const due = countdown(event.startAt, now);
          const filled = event.filled;
          const lineupPath = getEventEditorTabPath(event.eventId, "artists");
          return (
            <section key={event.eventId} className="border" data-testid="open-positions-event">
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-muted/20 px-3 py-2">
                <span className="w-28 shrink-0 text-sm font-semibold tabular-nums">
                  {formatDate(event.startAt)}
                </span>
                <span className={cn("shrink-0 border px-1.5 py-0.5 text-2xs font-semibold uppercase", due.tone)}>
                  {due.label}
                </span>
                <Link href={lineupPath} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">
                  {event.title}
                  {event.venueName ? (
                    <span className="font-normal text-muted-foreground"> · {event.venueName}</span>
                  ) : null}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {filled} of {event.totalPositions} filled
                </span>
              </header>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t px-3 py-2">
                <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <UserCircleIcon className="size-3.5" />
                  Operations lead
                </span>
                <div className="w-full min-w-0 sm:w-56">
                  <UserSelect
                    value={leadFor(event.eventId, event.operationsLeadUserId)}
                    onChange={(value) => void changeLead(event.eventId, value)}
                    options={userSelectOptions}
                    emptyLabel="Unassigned"
                    clearable
                  />
                </div>
              </div>
              <ul className="divide-y border-t">
                {event.openPositions.map((position) => (
                  <li
                    key={position.needId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2"
                  >
                    <span className="w-28 shrink-0 text-sm text-muted-foreground tabular-nums">
                      {position.setStartsAt != null
                        ? `${formatTime(position.setStartsAt)}${
                            position.setEndsAt != null ? ` – ${formatTime(position.setEndsAt)}` : ""
                          }`
                        : "No set time"}
                    </span>
                    <div className="min-w-40 flex-1">
                      <p className="truncate text-sm font-medium">{position.label || "Unnamed position"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[TYPE_LABELS.get(position.artistType), position.genres].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {position.inquiryCount > 0 ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs text-status-emerald-700 dark:text-status-emerald-300">
                        <ChatCircleIcon className="size-3.5" />
                        {position.inquiryCount} inquir{position.inquiryCount === 1 ? "y" : "ies"}
                      </span>
                    ) : null}
                    <Button asChild size="sm" variant="outline">
                      <Link href={`${lineupPath}?position=${position.needId}`}>Fill</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
