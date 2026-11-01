import {
  BroomIcon,
  CalendarDotsIcon,
  ClockCounterClockwiseIcon,
  ListChecksIcon,
  SlidersHorizontalIcon,
  type Icon,
} from "@phosphor-icons/react";

export const HASHING_BASE_PATH = "/dashboard/events/hashing";

export const HASHING_TABS = ["mine", "schedule", "history", "checklist", "setup"] as const;

export type HashingTabId = (typeof HASHING_TABS)[number];

export const HASHING_TAB_LABELS: Record<HashingTabId, string> = {
  mine: "My hashes",
  schedule: "Schedule",
  history: "History",
  checklist: "Checklist",
  setup: "Setup",
};

export const HASHING_TAB_ICONS: Record<HashingTabId, Icon> = {
  mine: BroomIcon,
  schedule: CalendarDotsIcon,
  history: ClockCounterClockwiseIcon,
  checklist: ListChecksIcon,
  setup: SlidersHorizontalIcon,
};

export function hashingTabPath(tab: HashingTabId) {
  return tab === "mine" ? HASHING_BASE_PATH : `${HASHING_BASE_PATH}/${tab}`;
}

export function hashPath(hashDateId: string) {
  return `${HASHING_BASE_PATH}/${hashDateId}`;
}

export function activeHashingTab(pathname: string): HashingTabId {
  const segment = pathname.slice(HASHING_BASE_PATH.length + 1).split("/")[0];
  return HASHING_TABS.find((tab) => tab === segment) ?? "mine";
}
