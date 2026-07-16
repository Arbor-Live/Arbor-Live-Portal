import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbCtx = MutationCtx | QueryCtx;

export async function resolveHostLink(
  ctx: DbCtx,
  hostGroupId: Id<"invoiceGroups"> | null | undefined,
): Promise<{ hostGroupId: Id<"invoiceGroups"> | undefined; host: string | undefined }> {
  if (!hostGroupId) {
    return { hostGroupId: undefined, host: undefined };
  }
  const group = await ctx.db.get(hostGroupId);
  if (!group) throw new Error("Host organization not found.");
  return {
    hostGroupId: group._id,
    host: group.name,
  };
}
