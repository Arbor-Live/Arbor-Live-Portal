"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowCounterClockwiseIcon,
  ArrowLeftIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  CaretDownIcon,
  CopySimpleIcon,
  DotsThreeIcon,
  GlobeIcon,
  InfoIcon,
  LockSimpleIcon,
  MapPinIcon,
  RepeatIcon,
  TrashIcon,
  UserCircleIcon,
  type Icon,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VenueDetailsSheet } from "@/components/venues/venue-details-sheet";
import { EventBriefButton } from "@/components/events/event-brief-button";
import { LinkedEventDaySwitcher } from "@/components/events/linked-event-day-switcher";
import { getDerivedLifecycleState } from "@/components/events/event-state-badges";
import {
  EVENT_STATUS_EDITOR_OPTIONS,
  eventStatusBadgeTone,
  formatEventStatusLabel,
  type EventStatus,
} from "@/lib/event-status";
import { formatEventVisibilityLabel, type EventVisibility } from "@/lib/event-visibility";
import { localDateTimeInputToMs } from "@/lib/crew-availability";
import { formatDateTimeRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Id } from "@/lib/convex-api";
import { EVENT_TYPE_ICONS } from "@/components/events/workspace/event-draft";
import { useEventWorkspace } from "@/components/events/workspace/event-workspace-provider";

type Tone = "neutral" | "blue" | "emerald" | "amber" | "rose";

const TONE_PILL: Record<Tone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  blue: "border-status-blue-500/30 bg-status-blue-500/15 text-status-blue-700",
  emerald: "border-status-emerald-500/30 bg-status-emerald-500/15 text-status-emerald-700",
  amber: "border-status-amber-500/30 bg-status-amber-500/15 text-status-amber-700",
  rose: "border-status-rose-500/30 bg-status-rose-500/15 text-status-rose-700",
};

const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  blue: "bg-status-blue-500",
  emerald: "bg-status-emerald-500",
  amber: "bg-status-amber-500",
  rose: "bg-status-rose-500",
};

const LIFECYCLE_LABELS = {
  upcoming: { label: "Upcoming", tone: "neutral" },
  live: { label: "Live now", tone: "blue" },
  wrap: { label: "Wrapping up", tone: "amber" },
  done: { label: "Done", tone: "emerald" },
  cancelled: { label: "Cancelled", tone: "rose" },
} as const satisfies Record<string, { label: string; tone: Tone }>;

const VISIBILITY_ICONS: Record<EventVisibility, Icon> = {
  public: GlobeIcon,
  internal: LockSimpleIcon,
  informational: InfoIcon,
};

function StatusPicker({
  value,
  onChange,
  disabled,
}: {
  value: EventStatus;
  onChange: (value: EventStatus) => void;
  disabled: boolean;
}) {
  const tone = eventStatusBadgeTone(value);
  const pill = (
    <span
      className={cn(
        "inline-flex h-7 items-center gap-1.5 border px-2.5 text-xs font-semibold",
        TONE_PILL[tone],
      )}
    >
      <span className={cn("size-1.5 rounded-full", TONE_DOT[tone])} />
      {formatEventStatusLabel(value)}
      {disabled ? null : <CaretDownIcon className="size-3 opacity-70" />}
    </span>
  );
  if (disabled) return pill;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Status: ${formatEventStatusLabel(value)}`}>
          {pill}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuLabel>Status</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as EventStatus)}>
          {EVENT_STATUS_EDITOR_OPTIONS.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <span className={cn("size-2 rounded-full", TONE_DOT[eventStatusBadgeTone(option.value)])} />
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MetaItem({ icon: ItemIcon, children }: { icon: Icon; children: React.ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <ItemIcon className="size-4 shrink-0 text-muted-foreground" />
      <span className="truncate">{children}</span>
    </span>
  );
}

export function EventWorkspaceHeader() {
  const workspace = useEventWorkspace();
  const {
    eventId,
    eventData,
    siblingDays,
    draft,
    updateDraft,
    readOnly,
    isAdmin,
    seriesMeta,
    userSelectOptions,
  } = workspace;
  const [venueOpen, setVenueOpen] = useState(false);
  const event = eventData?.event;

  const startMs = localDateTimeInputToMs(draft.startAt);
  const endMs = localDateTimeInputToMs(draft.endAt);
  const lifecycle = event
    ? LIFECYCLE_LABELS[
        getDerivedLifecycleState({ status: draft.status, startAt: event.startAt, endAt: event.endAt })
      ]
    : null;
  const TypeIcon = EVENT_TYPE_ICONS[draft.eventType];
  const VisibilityIcon = VISIBILITY_ICONS[draft.visibility];
  const managerName = draft.managerUserId
    ? userSelectOptions.find((option) => option.value === draft.managerUserId)?.label
    : undefined;
  const hasSiblingDays = (siblingDays?.length ?? 0) > 1;
  const showMenu = hasSiblingDays || Boolean(seriesMeta) || isAdmin;

  return (
    <header className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/dashboard/events">
            <ArrowLeftIcon />
            Events
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <EventBriefButton eventId={eventId} />
          {showMenu ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon-lg" aria-label="More event actions">
                  <DotsThreeIcon className="size-5" weight="bold" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                {hasSiblingDays ? (
                  <DropdownMenuItem
                    disabled={readOnly}
                    onSelect={() => void workspace.copySetupToOtherDays()}
                  >
                    <CopySimpleIcon />
                    Copy setup to other days
                  </DropdownMenuItem>
                ) : null}
                {seriesMeta ? (
                  <>
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/events/series/${seriesMeta._id}`}>
                        <RepeatIcon />
                        Open series
                      </Link>
                    </DropdownMenuItem>
                    {seriesMeta.seriesDetached ? (
                      <DropdownMenuItem
                        disabled={readOnly}
                        onSelect={() => void workspace.resetToSeries()}
                      >
                        <ArrowCounterClockwiseIcon />
                        Reset to series template
                      </DropdownMenuItem>
                    ) : null}
                  </>
                ) : null}
                {isAdmin ? (
                  <>
                    {hasSiblingDays || seriesMeta ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem variant="destructive" onSelect={() => void workspace.deleteEvent()}>
                      <TrashIcon />
                      {draft.status === "cancelled" ? "Delete event" : "Cancel & delete event"}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPicker
            value={draft.status}
            onChange={(status) => updateDraft({ status })}
            disabled={readOnly}
          />
          {lifecycle && lifecycle.label !== "Cancelled" ? (
            <span
              className={cn(
                "inline-flex h-7 items-center border px-2.5 text-xs font-medium",
                TONE_PILL[lifecycle.tone],
              )}
            >
              {lifecycle.label}
            </span>
          ) : null}
          {seriesMeta ? (
            <Link
              href={`/dashboard/events/series/${seriesMeta._id}`}
              className="inline-flex h-7 items-center gap-1.5 border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <RepeatIcon className="size-3.5" />
              Recurring · occurrence {(seriesMeta.occurrenceIndex ?? 0) + 1} of {seriesMeta.totalOccurrences}
              {seriesMeta.seriesDetached ? " · detached" : ""}
              <span className="sr-only"> — </span>
              <span className="underline underline-offset-2">View series</span>
            </Link>
          ) : null}
        </div>
        {readOnly ? (
          <h1 className="text-2xl font-semibold tracking-tight">{draft.title || event?.title}</h1>
        ) : (
          <input
            value={draft.title}
            onChange={(e) => updateDraft({ title: e.target.value })}
            aria-label="Event title"
            data-testid="event-title-input"
            placeholder={event ? "Untitled event" : "Loading…"}
            className="-mx-1.5 w-full border border-transparent bg-transparent px-1.5 py-0.5 text-2xl font-semibold tracking-tight outline-none hover:border-border focus:border-ring"
          />
        )}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
          <MetaItem icon={CalendarBlankIcon}>
            {startMs != null && endMs != null ? formatDateTimeRange(startMs, endMs) : "No dates yet"}
          </MetaItem>
          {event?.venueId ? (
            <button
              type="button"
              onClick={() => setVenueOpen(true)}
              className="inline-flex min-w-0 items-center gap-1.5 hover:underline"
            >
              <MapPinIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{event.venueName ?? "Venue"}</span>
            </button>
          ) : (
            <MetaItem icon={MapPinIcon}>
              <span className="text-muted-foreground">No venue</span>
            </MetaItem>
          )}
          <MetaItem icon={TypeIcon}>{draft.eventType}</MetaItem>
          {event?.host ? <MetaItem icon={BuildingsIcon}>{event.host}</MetaItem> : null}
          {managerName ? <MetaItem icon={UserCircleIcon}>{managerName}</MetaItem> : null}
          <MetaItem icon={VisibilityIcon}>
            {formatEventVisibilityLabel(draft.visibility).replace(/\s*\(.*\)$/, "")}
          </MetaItem>
        </div>
      </div>

      {hasSiblingDays && siblingDays ? (
        <LinkedEventDaySwitcher
          days={siblingDays}
          selectedEventId={eventId}
          onSelect={(nextId: Id<"events">) => void workspace.switchToDay(nextId)}
        />
      ) : null}

      {event?.venueId ? (
        <VenueDetailsSheet
          venueId={venueOpen ? event.venueId : null}
          open={venueOpen}
          onOpenChange={setVenueOpen}
        />
      ) : null}
    </header>
  );
}
