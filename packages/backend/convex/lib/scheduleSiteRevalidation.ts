import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  inventoryPackageRevalidatePaths,
  inventoryTypeRevalidatePaths,
  marketingRevalidatePaths,
  publicEventsRevalidatePaths,
} from "./siteRevalidationPaths";

type MutationCtx = GenericMutationCtx<DataModel>;

export async function scheduleMarketingSiteRevalidation(
  ctx: MutationCtx,
  slug?: string,
) {
  await ctx.scheduler.runAfter(0, internal.lib.siteRevalidation.trigger, {
    paths: marketingRevalidatePaths(slug),
  });
}

export async function scheduleInventoryPackageSiteRevalidation(
  ctx: MutationCtx,
  packageId?: string,
) {
  await ctx.scheduler.runAfter(0, internal.lib.siteRevalidation.trigger, {
    paths: inventoryPackageRevalidatePaths(packageId),
  });
}

export async function scheduleInventoryTypeSiteRevalidation(ctx: MutationCtx) {
  await ctx.scheduler.runAfter(0, internal.lib.siteRevalidation.trigger, {
    paths: inventoryTypeRevalidatePaths(),
  });
}

export async function schedulePublicEventsSiteRevalidation(
  ctx: MutationCtx,
  eventId?: string,
) {
  await ctx.scheduler.runAfter(0, internal.lib.siteRevalidation.trigger, {
    paths: publicEventsRevalidatePaths(eventId),
  });
}
