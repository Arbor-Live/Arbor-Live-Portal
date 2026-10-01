import {
  GridFourIcon,
  HeadphonesIcon,
  NotePencilIcon,
  PackageIcon,
  PlugsConnectedIcon,
  type Icon,
} from "@phosphor-icons/react";

/**
 * The rider editor's areas. They are a `?tab=` param on one page rather than
 * routes, so switching keeps the unsaved draft without a provider.
 */
export const RIDER_EDITOR_TABS = ["stage", "inputs", "monitors", "backline", "details"] as const;

export type RiderEditorTabId = (typeof RIDER_EDITOR_TABS)[number];

export const RIDER_EDITOR_TAB_LABELS: Record<RiderEditorTabId, string> = {
  stage: "Stage plot",
  inputs: "Inputs",
  monitors: "Monitors",
  backline: "Backline",
  details: "Details",
};

export const RIDER_EDITOR_TAB_ICONS: Record<RiderEditorTabId, Icon> = {
  stage: GridFourIcon,
  inputs: PlugsConnectedIcon,
  monitors: HeadphonesIcon,
  backline: PackageIcon,
  details: NotePencilIcon,
};

export function riderEditorTabFromParam(value: string | null): RiderEditorTabId {
  return (RIDER_EDITOR_TABS as readonly string[]).includes(value ?? "")
    ? (value as RiderEditorTabId)
    : "stage";
}

export function riderEditorTabHref(pathname: string, tab: RiderEditorTabId): string {
  return tab === "stage" ? pathname : `${pathname}?tab=${tab}`;
}
