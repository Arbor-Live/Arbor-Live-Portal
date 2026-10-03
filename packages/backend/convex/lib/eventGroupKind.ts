import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

/**
 * Event groups (`eventSeries` rows) come in two kinds. Kept free of heavy
 * imports so `schema.ts` can use the validator.
 */
export const eventGroupKindValue = v.union(v.literal("recurring"), v.literal("multi_day"));

export type EventGroupKind = "recurring" | "multi_day";

export function eventGroupKind(group: Pick<Doc<"eventSeries">, "kind">): EventGroupKind {
  return group.kind;
}

export function isRecurringGroup(group: Pick<Doc<"eventSeries">, "kind">) {
  return eventGroupKind(group) === "recurring";
}

export function isMultiDayGroup(group: Pick<Doc<"eventSeries">, "kind">) {
  return eventGroupKind(group) === "multi_day";
}
