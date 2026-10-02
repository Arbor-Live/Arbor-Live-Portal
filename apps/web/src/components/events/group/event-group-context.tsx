"use client";

import { createContext, useContext } from "react";
import type { useQuery } from "convex/react";
import type { api, Id } from "@/lib/convex-api";
import type { EventGroupKind } from "@/lib/event-series";
import type { EventGroupTabId } from "@/lib/event-group-tabs";

export type EventGroupData = NonNullable<ReturnType<typeof useQuery<typeof api.eventSeries.get>>>;

type EventGroupContextValue = {
  groupId: Id<"eventSeries">;
  /** Undefined while loading; the workspace only renders tabs once loaded. */
  data: EventGroupData | undefined;
  kind: EventGroupKind;
  /** Tabs with unsaved template edits (every tab stays mounted, so edits survive a switch). */
  dirtyTabs: ReadonlySet<EventGroupTabId>;
  setTabDirty: (tab: EventGroupTabId, dirty: boolean) => void;
};

export const EventGroupContext = createContext<EventGroupContextValue | null>(null);

/** Read group data and unsaved-tab state; throw outside the group provider. */
export function useEventGroup() {
  const value = useContext(EventGroupContext);
  if (!value) throw new Error("useEventGroup must be used inside the event group page.");
  return value;
}
