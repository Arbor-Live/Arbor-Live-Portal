import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getUserId, isAdmin, requireAuth, type AuthUser } from "./auth";

export function isEventLead(
  userId: string,
  event: Pick<Doc<"events">, "dayOfLeadUserId" | "eventManagerUserId">,
): boolean {
  if (userId === event.dayOfLeadUserId) return true;
  if (userId === event.eventManagerUserId) return true;
  return false;
}

export function canEditEventForUser(
  user: AuthUser,
  event: Pick<Doc<"events">, "dayOfLeadUserId" | "eventManagerUserId">,
): boolean {
  if (isAdmin(user)) return true;
  const userId = getUserId(user);
  if (!userId) return false;
  return isEventLead(userId, event);
}

export async function canEditEvent(
  ctx: QueryCtx | MutationCtx,
  event: Doc<"events">,
): Promise<boolean> {
  const user = await requireAuth(ctx);
  return canEditEventForUser(user, event);
}

export async function requireEventEditAccess(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  await requireAuth(ctx);
  const event = await ctx.db.get(eventId);
  if (!event) throw new Error("Event not found.");
  const canEdit = await canEditEvent(ctx, event);
  if (!canEdit) throw new Error("You do not have permission to edit this event.");
  return event;
}
