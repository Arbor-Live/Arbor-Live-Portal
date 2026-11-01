import { v, type Infer } from "convex/values";

export const hashDateOriginValue = v.union(v.literal("regular"), v.literal("added"));
export const hashDateStatusValue = v.union(
  v.literal("scheduled"),
  v.literal("off"),
  v.literal("in_progress"),
  v.literal("finished"),
);
export const hashAnswerValue = v.union(v.literal("can"), v.literal("cant"));
export const hashBookingStatusValue = v.union(v.literal("booked"), v.literal("needs_confirmation"));
export const hashCheckStatusValue = v.union(v.literal("done"), v.literal("flagged"));
export const hashFlagReasonValue = v.union(
  v.literal("missing"),
  v.literal("damaged"),
  v.literal("low"),
  v.literal("other"),
);

export const hashStandingValue = v.union(
  v.object({
    kind: v.literal("no_dates_work"),
    reason: v.string(),
    suggestedTimes: v.string(),
  }),
  v.object({
    kind: v.literal("exempt"),
    reason: v.string(),
    exemptedBy: v.string(),
  }),
);

const checklistLineValue = v.object({ id: v.string(), text: v.string() });

export const checklistKitValue = v.object({
  id: v.string(),
  name: v.string(),
  items: v.array(checklistLineValue),
});

export const checklistAreaValue = v.object({
  id: v.string(),
  name: v.string(),
  placements: v.array(
    v.object({
      kitId: v.string(),
      extraItems: v.array(checklistLineValue),
    }),
  ),
  finalChecks: v.array(checklistLineValue),
});

export const checklistTreeFields = {
  kits: v.array(checklistKitValue),
  areas: v.array(checklistAreaValue),
};

export const checklistTreeValue = v.object(checklistTreeFields);

export type HashStanding = Infer<typeof hashStandingValue>;
export type ChecklistTree = Infer<typeof checklistTreeValue>;
export type HashFlagReason = Infer<typeof hashFlagReasonValue>;
export type HashBookingStatus = Infer<typeof hashBookingStatusValue>;
export type HashDateStatus = Infer<typeof hashDateStatusValue>;
