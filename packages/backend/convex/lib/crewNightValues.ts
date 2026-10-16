import { v } from "convex/values";

/** A night answer: free all night, part of it, backup only, or not this one. */
export const nightStatusValue = v.union(
  v.literal("free"),
  v.literal("partial"),
  v.literal("backup"),
  v.literal("no"),
);

export const timeWindowValue = v.object({
  startsAt: v.number(),
  endsAt: v.number(),
});

/** How often someone is free on a weekday evening. */
export const usualLevelValue = v.union(
  v.literal("usually"),
  v.literal("sometimes"),
  v.literal("rarely"),
);

export const usualEveningsValue = v.object({
  sunday: v.optional(usualLevelValue),
  monday: v.optional(usualLevelValue),
  tuesday: v.optional(usualLevelValue),
  wednesday: v.optional(usualLevelValue),
  thursday: v.optional(usualLevelValue),
  friday: v.optional(usualLevelValue),
  saturday: v.optional(usualLevelValue),
});

/** Who wrote a night row: the person, a "dates I'm away" range, or the old-answer conversion. */
export const nightSourceValue = v.union(
  v.literal("answer"),
  v.literal("away"),
  v.literal("converted"),
);
