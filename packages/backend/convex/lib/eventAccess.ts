import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getUserId, hasOperationsAccess, requireAuth, type AuthUser } from "./auth";
import { appError } from "./errors";

export function isEventLead(
  userId: string,
  event: Pick<Doc<"events">, "dayOfLeadUserId" | "eventManagerUserId">,
): boolean {
  if (userId === event.dayOfLeadUserId) return true;
  if (userId === event.eventManagerUserId) return true;
  return false;
}

/**
 * Who may edit an event: admins and the Operations team edit every event
 * (details, Run of Show, crew, lineup); anyone else only events they lead.
 */
export async function canEditEventForUser(
  ctx: QueryCtx | MutationCtx,
  user: AuthUser,
  event: Pick<Doc<"events">, "dayOfLeadUserId" | "eventManagerUserId">,
): Promise<boolean> {
  const userId = getUserId(user);
  if (userId && isEventLead(userId, event)) return true;
  return await hasOperationsAccess(ctx, user);
}

export async function canEditEvent(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
): Promise<boolean> {
  const user = await requireAuth(ctx);
  return await canEditEventForUser(ctx, user, event);
}

export async function requireEventEditAccess(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  await requireAuth(ctx);
  const event = await ctx.db.get(eventId);
  if (!event) appError("EVENT_NOT_FOUND", "Event not found.");
  const canEdit = await canEditEvent(ctx, event);
  if (!canEdit) {
    appError("EVENT_EDIT_FORBIDDEN", "You do not have permission to edit this event.");
  }
  return event;
}
