import { v } from "convex/values";

export const EVENT_VISIBILITIES = ["public", "internal", "informational"] as const;

export type EventVisibility = (typeof EVENT_VISIBILITIES)[number];

export const DEFAULT_EVENT_VISIBILITY: EventVisibility = "public";

export const eventVisibilityValue = v.union(
  v.literal("public"),
  v.literal("internal"),
  v.literal("informational"),
);

export function normalizeEventVisibility(visibility: string | undefined): EventVisibility {
  if (visibility === "internal" || visibility === "informational") return visibility;
  return "public";
}

/** Listed on the public marketing site (/events). */
export function isPublicSiteListableVisibility(visibility: string | undefined): boolean {
  return visibility === "public";
}

/** Eligible for marketing poster work in the design board. */
export function isMarketingPosterWorkVisibility(visibility: string | undefined): boolean {
  return visibility === "public" || visibility === "internal";
}

/** True when staff marked Marketing under Teams Interested on the event. */
export function eventHasMarketingTeamInterest(teamsInterested: string[] | undefined): boolean {
  return (teamsInterested ?? []).includes("Marketing");
}

/** Marketing designs can only publish when the event is fully public. */
export function canPublishMarketingDesignVisibility(visibility: string | undefined): boolean {
  return visibility === "public";
}

export function formatEventVisibilityLabel(visibility: EventVisibility): string {
  switch (visibility) {
    case "public":
      return "Public";
    case "internal":
      return "Internal";
    case "informational":
      return "Informational (Not an event, internal only)";
    default:
      return "Public";
  }
}
