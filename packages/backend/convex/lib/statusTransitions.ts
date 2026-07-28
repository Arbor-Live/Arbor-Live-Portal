import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const statusTransitionEntityTypeValue = v.union(
  v.literal("eventRequest"),
  v.literal("event"),
  v.literal("invoice"),
);

export type StatusTransitionEntityType = "eventRequest" | "event" | "invoice";

export const bookingDeclineReasonCodeValue = v.union(
  v.literal("capacity"),
  v.literal("scope_mismatch"),
  v.literal("budget"),
  v.literal("lead_time"),
  v.literal("duplicate"),
  v.literal("client_withdrew"),
  v.literal("other"),
);

export const eventCancelReasonCodeValue = v.union(
  v.literal("client_cancelled"),
  v.literal("weather"),
  v.literal("venue"),
  v.literal("staffing"),
  v.literal("duplicate"),
  v.literal("other"),
);

type RecordStatusTransitionArgs = {
  entityType: StatusTransitionEntityType;
  entityId: string;
  fromStatus?: string;
  toStatus: string;
  at?: number;
  actorUserId?: string;
  reasonCode?: string;
  reasonNote?: string;
};

export async function recordStatusTransition(ctx: MutationCtx, args: RecordStatusTransitionArgs) {
  const at = args.at ?? Date.now();
  if (args.fromStatus === args.toStatus) return;
  await ctx.db.insert("statusTransitions", {
    entityType: args.entityType,
    entityId: args.entityId,
    fromStatus: args.fromStatus,
    toStatus: args.toStatus,
    at,
    actorUserId: args.actorUserId,
    reasonCode: args.reasonCode,
    reasonNote: args.reasonNote,
  });
}

export async function recordEventRequestStatusTransition(
  ctx: MutationCtx,
  requestId: Id<"eventRequests">,
  fromStatus: string,
  toStatus: string,
  options?: {
    actorUserId?: string;
    at?: number;
    reasonCode?: string;
    reasonNote?: string;
  },
) {
  await recordStatusTransition(ctx, {
    entityType: "eventRequest",
    entityId: requestId,
    fromStatus,
    toStatus,
    actorUserId: options?.actorUserId,
    at: options?.at,
    reasonCode: options?.reasonCode,
    reasonNote: options?.reasonNote,
  });
}

export async function recordEventStatusTransition(
  ctx: MutationCtx,
  eventId: Id<"events">,
  fromStatus: string,
  toStatus: string,
  options?: {
    actorUserId?: string;
    at?: number;
    reasonCode?: string;
    reasonNote?: string;
  },
) {
  await recordStatusTransition(ctx, {
    entityType: "event",
    entityId: eventId,
    fromStatus,
    toStatus,
    actorUserId: options?.actorUserId,
    at: options?.at,
    reasonCode: options?.reasonCode,
    reasonNote: options?.reasonNote,
  });
}

export async function recordInvoiceStatusTransition(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
  fromStatus: string,
  toStatus: string,
  options?: {
    actorUserId?: string;
    at?: number;
    reasonCode?: string;
    reasonNote?: string;
  },
) {
  await recordStatusTransition(ctx, {
    entityType: "invoice",
    entityId: invoiceId,
    fromStatus,
    toStatus,
    actorUserId: options?.actorUserId,
    at: options?.at,
    reasonCode: options?.reasonCode,
    reasonNote: options?.reasonNote,
  });
}
