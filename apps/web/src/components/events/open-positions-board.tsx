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
import type { FunctionReturnType } from "convex/server";
import { ChatCircleIcon, PhoneOutgoingIcon, UserCircleIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { UserSelect, type UserSelectOption } from "@/components/users/user-select";
import { useSessionShell, useSessionViewer } from "@/components/session-shell-provider";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { assignableCrewSelectOptions } from "@/lib/user-select-description";
import {
  ACT_TYPE_OPTIONS,
  TYPE_LABELS,
  artistTypesLabel,
} from "@/components/events/lineup/lineup-model";
import { getEventEditorTabPath } from "@/lib/event-editor-tabs";
import { academicPeriod, periodMsRange } from "@/lib/academic-periods";
import { formatDate, formatTime, pacificDateKey } from "@/lib/format";
import { cn } from "@/lib/utils";
import { outreachStage, outreachSummary, type OutreachStage } from "@/lib/artist-outreach";
import { useSheetParam } from "@/hooks/use-sheet-param";
import {
  DetailSheet,
  DetailSheetFooter,
  DetailSheetHeader,
  EmptyState,
  ListSummary,
  RowCell,
  RowFlag,
  RowGroup,
  RowText,
  SheetSection,
} from "@/components/list-page";
import { ListRow } from "@/components/list-row";
import { OutreachChecklist } from "@/components/events/outreach/outreach-checklist";

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

const TYPE_FILTER_OPTIONS = [
  ...ACT_TYPE_OPTIONS,
  { value: "no_preference", label: TYPE_LABELS.no_preference },
];

const OUTREACH_OPTIONS: Array<{ value: OutreachStage; label: string }> = [
  { value: "none", label: "Nobody asked yet" },
  { value: "waiting", label: "Waiting on replies" },
  { value: "available", label: "An act is available" },
  { value: "declined", label: "Everyone said no" },
];

/** Outreach line per stage: emerald when an act can play, amber while waiting. */
const OUTREACH_TONE: Record<OutreachStage, string> = {
  none: "text-muted-foreground",
  waiting: "text-status-amber-700 dark:text-status-amber-300",
  available: "text-status-emerald-700 dark:text-status-emerald-300",
  declined: "text-destructive",
};

type BoardEvent = FunctionReturnType<typeof api.eventArtistNeeds.listOpenPositions>["events"][number];

/** Days until the show: rose inside a week, amber inside three. */
function countdown(startAt: number, now: number) {
  const days = Math.max(0, Math.ceil((startAt - now) / DAY_MS));
  const label = days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  const tone = days < 7 ? "rose" : days < 21 ? "amber" : "neutral";
  return { label, tone } as const;
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
  const [outreachEventId, setOutreachEventId] = useSheetParam("outreach");

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
      { id: "type", label: "Artist type", options: TYPE_FILTER_OPTIONS.map((option) => ({ ...option })) },
      {
        id: "venue",
        label: "Venue",
        options: [...new Set((events ?? []).map((event) => event.venueName).filter((name): name is string => Boolean(name)))]
          .sort((a, b) => a.localeCompare(b))
          .map((name) => ({ value: name, label: name })),
      },
      { id: "inquiries", label: "Inquiries", options: INQUIRY_OPTIONS, single: true },
      { id: "outreach", label: "Outreach", options: OUTREACH_OPTIONS },
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
      if (!matchesFilter(filters.outreach, outreachStage(event.outreach))) return [];
      const positions = event.openPositions.filter((position) => {
        const types = position.artistTypes.length > 0 ? position.artistTypes : ["no_preference"];
        if (!matchesFilter(filters.type, types)) return false;
        if (!matchesFilter(filters.inquiries, position.inquiryCount > 0 ? "some" : "none")) return false;
        if (needles.length === 0) return true;
        const haystack = [
          event.title,
          event.venueName,
          position.label,
          position.genres,
          artistTypesLabel(position.artistTypes),
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

  const outreachEvent = events?.find((event) => event.eventId === outreachEventId) ?? null;
  const awaitingReplies = visible.filter((event) => outreachStage(event.outreach) === "waiting").length;
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
      ) : openCount === 0 ? (
        <EmptyState>
          {assignedToMe
            ? "No open positions assigned to you in this range."
            : "Every position in this range is filled."}
        </EmptyState>
      ) : (
        <ListSummary testId="open-positions-summary" order="Soonest show first, then by set time.">
          {`${openCount} open position${openCount === 1 ? "" : "s"} across ${visible.length} event${
            visible.length === 1 ? "" : "s"
          }${withInquiries ? ` · ${withInquiries} with inquiries to review` : ""}${
            awaitingReplies ? ` · ${awaitingReplies} waiting on replies` : ""
          }`}
        </ListSummary>
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
          const lineupPath = getEventEditorTabPath(event.eventId, "artists");
          const openOutreach = () => setOutreachEventId(event.eventId);
          return (
            <RowGroup
              key={event.eventId}
              testId="open-positions-event"
              className="border"
              leading={
                <div className="w-28 shrink-0 space-y-1">
                  <p className="text-sm font-semibold tabular-nums">{formatDate(event.startAt)}</p>
                  <RowFlag tone={due.tone} className="inline-block text-2xs font-semibold uppercase">
                    {due.label}
                  </RowFlag>
                </div>
              }
              title={
                <Link href={lineupPath} className="min-w-0 truncate hover:underline">
                  {event.title}
                </Link>
              }
              count={event.openPositions.length}
              description={[event.venueName, `${event.filled} of ${event.totalPositions} filled`]
                .filter(Boolean)
                .join(" · ")}
              aside={
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <span
                    className={cn("text-xs", OUTREACH_TONE[outreachStage(event.outreach)])}
                    data-testid="open-positions-outreach"
                  >
                    {outreachSummary(event.outreach)}
                  </span>
                  <div className="flex w-full min-w-0 items-center gap-1.5 sm:w-56" title="Operations lead">
                    <UserCircleIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="sr-only">Operations lead</span>
                    <div className="min-w-0 flex-1">
                      <UserSelect
                        value={leadFor(event.eventId, event.operationsLeadUserId)}
                        onChange={(value) => void changeLead(event.eventId, value)}
                        options={userSelectOptions}
                        emptyLabel="No operations lead"
                        clearable
                      />
                    </div>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={openOutreach}>
                    <PhoneOutgoingIcon />
                    Outreach
                  </Button>
                </div>
              }
            >
              {event.openPositions.map((position) => (
                <ListRow
                  key={position.needId}
                  data-testid={`open-position-${position.needId}`}
                  onOpen={openOutreach}
                  actions={
                    <Button asChild size="sm" variant="outline">
                      <Link href={`${lineupPath}?position=${position.needId}`}>Fill</Link>
                    </Button>
                  }
                >
                  <RowCell align="left" className="w-28 text-muted-foreground">
                    {position.setStartsAt != null
                      ? `${formatTime(position.setStartsAt)}${
                          position.setEndsAt != null ? ` – ${formatTime(position.setEndsAt)}` : ""
                        }`
                      : "No set time"}
                  </RowCell>
                  <RowText
                    eyebrow={artistTypesLabel(position.artistTypes)}
                    title={position.label || "Unnamed position"}
                    detail={position.genres || undefined}
                  />
                  {position.inquiryCount > 0 ? (
                    <RowFlag tone="emerald" className="flex items-center gap-1">
                      <ChatCircleIcon className="size-3.5" aria-hidden />
                      {position.inquiryCount} inquir{position.inquiryCount === 1 ? "y" : "ies"}
                    </RowFlag>
                  ) : null}
                </ListRow>
              ))}
            </RowGroup>
          );
        })}
      </div>

      <DetailSheet
        open={outreachEvent !== null}
        onOpenChange={(open) => {
          if (!open) setOutreachEventId(null);
        }}
        testId="outreach-sheet"
      >
        {outreachEvent ? <EventOutreachBody key={outreachEvent.eventId} event={outreachEvent} /> : null}
      </DetailSheet>
    </div>
  );
}

/** The board's side panel: who we've asked to play an event, and booking them into its slots. */
function EventOutreachBody({ event }: { event: BoardEvent }) {
  const lineupPath = getEventEditorTabPath(event.eventId, "artists");
  const open = event.openPositions.map((position) => position.label || artistTypesLabel(position.artistTypes)).join(", ");
  return (
    <>
      <DetailSheetHeader
        title={event.title}
        description={`${formatDate(event.startAt)}${event.venueName ? ` · ${event.venueName}` : ""} · Open: ${open}`}
      />
      <SheetSection title="Outreach">
        <OutreachChecklist eventId={event.eventId} idPrefix="board" />
      </SheetSection>
      <DetailSheetFooter>
        <Button asChild size="sm" variant="outline">
          <Link href={lineupPath}>Open the lineup</Link>
        </Button>
      </DetailSheetFooter>
    </>
  );
}
