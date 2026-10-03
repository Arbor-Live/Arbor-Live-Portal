"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowCounterClockwiseIcon,
  BuildingsIcon,
  CalendarBlankIcon,
  CalendarDotsIcon,
  CopyIcon,
  GlobeIcon,
  InfoIcon,
  LockSimpleIcon,
  MapPinIcon,
  ReceiptIcon,
  RepeatIcon,
  TrashIcon,
  UserCircleIcon,
  type Icon,
} from "@phosphor-icons/react";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import {
  EditablePageTitle,
  MetaItem,
  PageHeader,
  PageTitle,
  StatusPill,
  StatusPillSelect,
  type Tone,
} from "@/components/page-header";
import { VenueDetailsSheet } from "@/components/venues/venue-details-sheet";
import { EventBriefButton } from "@/components/events/event-brief-button";
import { LinkedEventDaySwitcher } from "@/components/events/linked-event-day-switcher";
import { getDerivedLifecycleState } from "@/components/events/event-state-badges";
import {
  EVENT_STATUS_EDITOR_OPTIONS,
  eventStatusBadgeTone,
} from "@/lib/event-status";
import { formatEventVisibilityLabel, type EventVisibility } from "@/lib/event-visibility";
import { localDateTimeInputToMs } from "@/lib/crew-availability";
import { formatDateTimeRange } from "@/lib/format";
import type { Id } from "@/lib/convex-api";
import { EVENT_TYPE_ICONS } from "@/components/events/workspace/event-draft";
import { useEventWorkspace } from "@/components/events/workspace/event-workspace-provider";

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

const STATUS_OPTIONS = EVENT_STATUS_EDITOR_OPTIONS.map((option) => ({
  ...option,
  tone: eventStatusBadgeTone(option.value),
}));

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
    linkedInvoice,
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
  const multiDayGroup = seriesMeta?.kind === "multi_day";
  // A series applies its setup from its template tabs, not from one occurrence.
  const canApplySetup = hasSiblingDays && seriesMeta?.kind !== "recurring";
  const hasUnsavedEdits = workspace.dirty.size > 0;
  const showMenu = canApplySetup || Boolean(seriesMeta) || isAdmin;

  return (
    <PageHeader
      back={{ href: "/dashboard/events", label: "Events" }}
      actions={<EventBriefButton eventId={eventId} />}
      menuLabel="More event actions"
      menu={
        showMenu ? (
          <>
            {canApplySetup ? (
              <DropdownMenuItem
                disabled={readOnly || hasUnsavedEdits}
                title={hasUnsavedEdits ? "Save this day first: applying uses its saved setup." : undefined}
                onSelect={() => workspace.setApplySetupOpen(true)}
              >
                <CopyIcon />
                Apply this day&apos;s setup to other days…
              </DropdownMenuItem>
            ) : null}
            {seriesMeta ? (
              <>
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/events/series/${seriesMeta._id}`}>
                    {multiDayGroup ? <CalendarDotsIcon /> : <RepeatIcon />}
                    {multiDayGroup ? "Open booking" : "Open series"}
                  </Link>
                </DropdownMenuItem>
                {seriesMeta.seriesDetached ? (
                  <DropdownMenuItem disabled={readOnly} onSelect={() => void workspace.resetToSeries()}>
                    <ArrowCounterClockwiseIcon />
                    {multiDayGroup ? "Reset to booking template" : "Reset to series template"}
                  </DropdownMenuItem>
                ) : null}
              </>
            ) : null}
            {isAdmin ? (
              <>
                {canApplySetup || seriesMeta ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem variant="destructive" onSelect={() => void workspace.deleteEvent()}>
                  <TrashIcon />
                  {draft.status === "cancelled" ? "Delete event" : "Cancel & delete event"}
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        ) : null
      }
      pills={
        <>
          <StatusPillSelect
            value={draft.status}
            options={STATUS_OPTIONS}
            onChange={(status) => updateDraft({ status })}
            disabled={readOnly}
          />
          {lifecycle && lifecycle.label !== "Cancelled" ? (
            <StatusPill tone={lifecycle.tone} dot={false} className="font-medium">
              {lifecycle.label}
            </StatusPill>
          ) : null}
          {seriesMeta ? (
            <Link
              href={`/dashboard/events/series/${seriesMeta._id}`}
              className="inline-flex h-7 items-center gap-1.5 border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {multiDayGroup ? (
                <>
                  <CalendarDotsIcon className="size-3.5" />
                  Part of {seriesMeta.title} · Day {(seriesMeta.occurrenceIndex ?? 0) + 1} of{" "}
                  {seriesMeta.totalOccurrences}
                </>
              ) : (
                <>
                  <RepeatIcon className="size-3.5" />
                  Recurring · occurrence {(seriesMeta.occurrenceIndex ?? 0) + 1} of{" "}
                  {seriesMeta.totalOccurrences}
                </>
              )}
              {seriesMeta.seriesDetached ? " · detached" : ""}
              <span className="sr-only"> — </span>
              <span className="underline underline-offset-2">
                {multiDayGroup ? "View booking" : "View series"}
              </span>
            </Link>
          ) : null}
          {isAdmin && linkedInvoice ? (
            <Link
              href={`/dashboard/financial-hub/invoices/${linkedInvoice._id}`}
              className="inline-flex h-7 items-center gap-1.5 border px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              data-testid="event-invoice-link"
            >
              <ReceiptIcon className="size-3.5" aria-hidden />
              Invoice {linkedInvoice.invoiceNumber}
            </Link>
          ) : null}
        </>
      }
      title={
        readOnly ? (
          <PageTitle>{draft.title || event?.title}</PageTitle>
        ) : (
          <EditablePageTitle
            value={draft.title}
            onChange={(title) => updateDraft({ title })}
            label="Event title"
            data-testid="event-title-input"
            placeholder={event ? "Untitled event" : "Loading…"}
          />
        )
      }
      meta={
        <>
          <MetaItem icon={CalendarBlankIcon}>
            {startMs != null && endMs != null ? formatDateTimeRange(startMs, endMs) : "No dates yet"}
          </MetaItem>
          {event?.venueId ? (
            <MetaItem icon={MapPinIcon} onClick={() => setVenueOpen(true)}>
              {event.venueName ?? "Venue"}
            </MetaItem>
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
        </>
      }
    >
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
    </PageHeader>
  );
}
