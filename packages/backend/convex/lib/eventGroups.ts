import { v } from "convex/values";

/**
 * An "event group" is a set of dated events that share setup and billing:
 * a recurring series (rule-based) or a multi-day booking (explicit dates).
 * It currently lives in the `eventSeries` table; `kind` distinguishes the two.
 */
export const EVENT_GROUP_KINDS = ["recurring", "multi_day"] as const;
export type EventGroupKind = (typeof EVENT_GROUP_KINDS)[number];

export const eventGroupKindValue = v.union(v.literal("recurring"), v.literal("multi_day"));

/** Rows predating `kind` are recurring series. */
export function eventGroupKind(group: { kind?: EventGroupKind }): EventGroupKind {
  return group.kind ?? "recurring";
}
