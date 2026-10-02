import { ClipboardTextIcon, UserCircleIcon, type Icon } from "@phosphor-icons/react";

/**
 * The Borrow requests page's areas. They're a `?tab=` param on one page:
 * reviewers land on To review, everyone else only has Mine.
 */
export const BORROW_REQUEST_TABS = ["review", "mine"] as const;

export type BorrowRequestTabId = (typeof BORROW_REQUEST_TABS)[number];

export const BORROW_REQUEST_TAB_LABELS: Record<BorrowRequestTabId, string> = {
  review: "To review",
  mine: "Mine",
};

export const BORROW_REQUEST_TAB_ICONS: Record<BorrowRequestTabId, Icon> = {
  review: ClipboardTextIcon,
  mine: UserCircleIcon,
};

export const BORROW_REQUESTS_PATH = "/dashboard/inventory/borrow-requests";

/** The tab to show: To review only for viewers who can review, else Mine. */
export function borrowRequestTabFromParam(value: string | null, canReview: boolean): BorrowRequestTabId {
  if (!canReview) return "mine";
  return value === "mine" ? "mine" : "review";
}

/** To review is the bare path (the reviewer's default); Mine is `?tab=mine`. */
export function borrowRequestTabHref(tab: BorrowRequestTabId): string {
  return tab === "review" ? BORROW_REQUESTS_PATH : `${BORROW_REQUESTS_PATH}?tab=mine`;
}
