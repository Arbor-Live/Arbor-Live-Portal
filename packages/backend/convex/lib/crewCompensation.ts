import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type UserCompensationRateMode = "normal" | "lead" | "custom";
export type PayrollMethod = "stanford" | "external";

export type InvoiceCrewRateSettings = {
  crewNormalRateUsd?: number;
  crewLeadRateUsd?: number;
  crewOtRateUsd?: number;
} | null;

export function normalizeCompensationRateMode(
  rateMode: UserCompensationRateMode | undefined | null,
): UserCompensationRateMode {
  return rateMode ?? "custom";
}

export function normalizePayrollMethod(
  payrollMethod: PayrollMethod | undefined | null,
): PayrollMethod {
  return payrollMethod ?? "stanford";
}

export function resolveHourlyRateUsdFromMode(
  rateMode: UserCompensationRateMode | undefined | null,
  hourlyRateUsd: number | undefined | null,
  settings: InvoiceCrewRateSettings,
): number {
  const mode = normalizeCompensationRateMode(rateMode);
  if (mode === "normal") {
    return Math.max(0, settings?.crewNormalRateUsd ?? 0);
  }
  if (mode === "lead") {
    return Math.max(0, settings?.crewLeadRateUsd ?? settings?.crewOtRateUsd ?? 0);
  }
  return Math.max(0, hourlyRateUsd ?? 0);
}

export function resolveUserCompensationHourlyRateUsd(
  rate: Pick<Doc<"userCompensationRates">, "rateMode" | "hourlyRateUsd"> | null | undefined,
  settings: InvoiceCrewRateSettings,
): number {
  if (!rate) return 0;
  return resolveHourlyRateUsdFromMode(rate.rateMode, rate.hourlyRateUsd, settings);
}

/** Average of Normal + Lead global rates — used for open-slot cost estimates. */
export function averageCrewHourlyRateUsd(settings: InvoiceCrewRateSettings): number | undefined {
  const normal = settings?.crewNormalRateUsd;
  const lead = settings?.crewLeadRateUsd ?? settings?.crewOtRateUsd;
  const rates = [normal, lead].filter(
    (rate): rate is number => rate !== undefined && Number.isFinite(rate) && rate > 0,
  );
  if (rates.length === 0) return undefined;
  return Math.round((rates.reduce((sum, rate) => sum + rate, 0) / rates.length) * 100) / 100;
}

/** Open-slot estimate: explicit shift rate, else average of global Normal/Lead. */
export function resolveOpenSlotHourlyRateUsd(
  estimatedHourlyRateUsd: number | undefined,
  settings: InvoiceCrewRateSettings,
): number {
  if (estimatedHourlyRateUsd !== undefined && estimatedHourlyRateUsd > 0) {
    return estimatedHourlyRateUsd;
  }
  return averageCrewHourlyRateUsd(settings) ?? 0;
}

export async function loadInvoiceCrewRateSettings(ctx: QueryCtx | MutationCtx) {
  return await ctx.db
    .query("invoiceSettings")
    .withIndex("by_key", (q) => q.eq("key", "default"))
    .unique();
}

export async function upsertUserCompensationRate(
  ctx: MutationCtx,
  args: {
    userId: string;
    rateMode: UserCompensationRateMode;
    hourlyRateUsd?: number;
    updatedByUserId?: string;
  },
) {
  const mode = args.rateMode;
  if (mode === "custom") {
    if (args.hourlyRateUsd === undefined || args.hourlyRateUsd < 0) {
      throw new Error("Custom hourly rate must be a non-negative number.");
    }
  } else if (args.hourlyRateUsd !== undefined && args.hourlyRateUsd < 0) {
    throw new Error("Hourly rate must be a non-negative number.");
  }

  const now = Date.now();
  const hourlyRateUsd = mode === "custom" ? (args.hourlyRateUsd ?? 0) : (args.hourlyRateUsd ?? 0);
  const existing = await ctx.db
    .query("userCompensationRates")
    .withIndex("by_userId", (q) => q.eq("userId", args.userId))
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      rateMode: mode,
      hourlyRateUsd,
      updatedByUserId: args.updatedByUserId,
      updatedAt: now,
    });
    return existing._id;
  }

  return await ctx.db.insert("userCompensationRates", {
    userId: args.userId,
    rateMode: mode,
    hourlyRateUsd,
    updatedByUserId: args.updatedByUserId,
    createdAt: now,
    updatedAt: now,
  });
}

export async function applyPayrollMethodToProfile(
  ctx: MutationCtx,
  userId: string,
  payrollMethod: PayrollMethod,
) {
  const profile = await ctx.db
    .query("userAdminProfiles")
    .withIndex("by_userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile) {
    throw new Error("User profile not found.");
  }
  await ctx.db.patch(profile._id, {
    payrollMethod,
    updatedAt: Date.now(),
  });
}
