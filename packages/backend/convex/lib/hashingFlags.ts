import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/** A flag sent to Damage & repair follows its report, so ops close it once. */
export async function syncFlagWithDamageReport(
  ctx: MutationCtx,
  damageReportId: Id<"damageReports">,
  resolution: { resolved: true; userId: string; at: number } | { resolved: false },
) {
  const flags = await ctx.db
    .query("hashChecks")
    .withIndex("by_damageReportId", (q) => q.eq("damageReportId", damageReportId))
    .take(10);
  for (const flag of flags) {
    await ctx.db.patch(
      flag._id,
      resolution.resolved
        ? { resolvedAt: resolution.at, resolvedBy: resolution.userId }
        : { resolvedAt: undefined, resolvedBy: undefined },
    );
  }
}
