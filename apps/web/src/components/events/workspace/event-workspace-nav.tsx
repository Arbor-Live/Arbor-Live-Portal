"use client";

import Link from "next/link";
import {
  CalendarDotsIcon,
  MegaphoneIcon,
  MicrophoneStageIcon,
  PackageIcon,
  ReceiptIcon,
  SquaresFourIcon,
  WarningIcon,
  type Icon,
} from "@phosphor-icons/react";
import {
  EVENT_EDITOR_TAB_LABELS,
  getEventEditorTabPath,
  type EventEditorTabId,
} from "@/lib/event-editor-tabs";
import { cn } from "@/lib/utils";
import type { DraftSection } from "@/components/events/workspace/event-draft";
import { useEventWorkspace } from "@/components/events/workspace/event-workspace-provider";

const TAB_ICONS: Record<EventEditorTabId, Icon> = {
  overview: SquaresFourIcon,
  schedule: CalendarDotsIcon,
  equipment: PackageIcon,
  artists: MicrophoneStageIcon,
  billing: ReceiptIcon,
  promo: MegaphoneIcon,
};

const TAB_DIRTY_SECTION: Partial<Record<EventEditorTabId, DraftSection | "schedule">> = {
  overview: "details",
  schedule: "schedule",
  artists: "lineup",
  billing: "billing",
  promo: "promo",
};

export function EventWorkspaceNav() {
  const { eventId, eventData, visibleTabs, activeTab, dirty, shifts } = useEventWorkspace();
  const openSlots = shifts.filter((shift) => !shift.userId && !shift.crewApplicationId).length;
  const pullListCount = eventData?.pullListItems.length ?? 0;

  function badgeFor(tab: EventEditorTabId) {
    if (tab === "schedule" && openSlots > 0) {
      return (
        <span
          className="inline-flex items-center gap-0.5 text-status-amber-700"
          title={`${openSlots} open crew slot${openSlots === 1 ? "" : "s"}`}
        >
          <WarningIcon className="size-3.5" weight="fill" />
          <span className="text-xs tabular-nums">{openSlots}</span>
        </span>
      );
    }
    if (tab === "equipment" && pullListCount > 0) {
      return (
        <span className="bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{pullListCount}</span>
      );
    }
    return null;
  }

  return (
    <nav
      aria-label="Event sections"
      className="sticky top-0 z-30 -mx-6 border-b bg-background/95 px-6 backdrop-blur supports-[backdrop-filter]:bg-background/80"
    >
      <div className="-mb-px flex gap-1 overflow-x-auto">
        {visibleTabs.map((tab) => {
          const TabIcon = TAB_ICONS[tab];
          const active = tab === activeTab;
          const section = TAB_DIRTY_SECTION[tab];
          const isDirty = section ? dirty.has(section) : false;
          return (
            <Link
              key={tab}
              href={getEventEditorTabPath(eventId, tab)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <TabIcon className="size-4" weight={active ? "fill" : "regular"} />
              {EVENT_EDITOR_TAB_LABELS[tab]}
              {badgeFor(tab)}
              {isDirty ? (
                <span
                  className="size-1.5 rounded-full bg-primary"
                  aria-label="Unsaved changes"
                  title="Unsaved changes"
                />
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
