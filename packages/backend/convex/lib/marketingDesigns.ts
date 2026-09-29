import type { Doc } from "../_generated/dataModel";

type DesignDoc = Doc<"eventMarketingDesigns">;

/**
 * A design the website can show: published to the site, or ready to publish.
 * Drafts and archived designs stay internal.
 */
export function isWebsiteVisibleDesign(design: DesignDoc): boolean {
  return design.status === "published" || design.status === "ready";
}

/**
 * Newest website-visible design among the rows loaded for one event, or null.
 * Several designs can share an event; the most recently updated wins, the same
 * rule the public event page uses.
 */
export function latestWebsiteVisibleDesign(
  designs: readonly DesignDoc[],
): DesignDoc | null {
  let best: DesignDoc | null = null;
  for (const design of designs) {
    if (!isWebsiteVisibleDesign(design)) continue;
    if (!best || design.updatedAt > best.updatedAt) best = design;
  }
  return best;
}

/** How many designs to read for one event before picking the newest visible. */
export const MAX_DESIGNS_PER_EVENT = 20;
