"use client";

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
import { PageTabs } from "@/components/page-header";
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
    <PageTabs
      label="Event sections"
      tabs={visibleTabs.map((tab) => {
        const section = TAB_DIRTY_SECTION[tab];
        return {
          href: getEventEditorTabPath(eventId, tab),
          label: EVENT_EDITOR_TAB_LABELS[tab],
          icon: TAB_ICONS[tab],
          active: tab === activeTab,
          badge: badgeFor(tab),
          dirty: section ? dirty.has(section) : false,
        };
      })}
    />
  );
}
