import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { findSeriesByInvoiceId } from "./invoiceSeries";
import { listEventsByInvoiceId } from "./invoiceEvents";

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

/**
 * Validates additional co-host orgs, drops duplicates and the primary host,
 * and preserves first-seen order.
 */
export async function resolveAdditionalHostGroupIds(
  ctx: DbCtx,
  primaryHostGroupId: Id<"invoiceGroups"> | null | undefined,
  additionalHostGroupIds: Id<"invoiceGroups">[] | null | undefined,
): Promise<Id<"invoiceGroups">[] | undefined> {
  if (!additionalHostGroupIds || additionalHostGroupIds.length === 0) {
    return undefined;
  }
  const seen = new Set<string>();
  const resolved: Id<"invoiceGroups">[] = [];
  for (const id of additionalHostGroupIds) {
    if (!id || seen.has(id)) continue;
    if (primaryHostGroupId && id === primaryHostGroupId) continue;
    const group = await ctx.db.get(id);
    if (!group) throw new Error("Additional host organization not found.");
    if (group.active === false) throw new Error(`Host organization "${group.name}" is archived.`);
    seen.add(id);
    resolved.push(id);
  }
  return resolved.length > 0 ? resolved : undefined;
}

export async function resolveAdditionalHostNames(
  ctx: DbCtx,
  additionalHostGroupIds: Id<"invoiceGroups">[] | undefined,
): Promise<string[]> {
  if (!additionalHostGroupIds || additionalHostGroupIds.length === 0) return [];
  const names: string[] = [];
  for (const id of additionalHostGroupIds) {
    const group = await ctx.db.get(id);
    if (group?.name) names.push(group.name);
  }
  return names;
}

export function formatHostLabel(
  primaryHost: string | undefined,
  additionalHostNames: string[],
): string | undefined {
  const parts = [primaryHost?.trim(), ...additionalHostNames.map((n) => n.trim())].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export async function loadEventHostDisplay(
  ctx: DbCtx,
  event: {
    host?: string;
    additionalHostGroupIds?: Id<"invoiceGroups">[];
  },
): Promise<{ host?: string; additionalHosts: string[]; hostLabel?: string }> {
  const additionalHosts = await resolveAdditionalHostNames(ctx, event.additionalHostGroupIds);
  return {
    host: event.host,
    additionalHosts,
    hostLabel: formatHostLabel(event.host, additionalHosts),
  };
}

/** Primary host comes from the linked invoice when present; otherwise from explicit hostGroupId. */
export async function resolveEventPrimaryHostLink(
  ctx: DbCtx,
  options: {
    invoiceId?: Id<"invoices"> | null;
    hostGroupId?: Id<"invoiceGroups"> | null;
    existingInvoiceId?: Id<"invoices"> | null;
    existingHostGroupId?: Id<"invoiceGroups"> | null;
    existingHost?: string;
  },
): Promise<{ hostGroupId: Id<"invoiceGroups"> | undefined; host: string | undefined }> {
  const invoiceId =
    options.invoiceId !== undefined ? options.invoiceId ?? undefined : options.existingInvoiceId ?? undefined;
  if (invoiceId) {
    const invoice = await ctx.db.get(invoiceId);
    if (!invoice) throw new Error("Linked invoice not found.");
    if (!invoice.groupId) {
      return { hostGroupId: undefined, host: undefined };
    }
    return resolveHostLink(ctx, invoice.groupId);
  }
  if (options.hostGroupId !== undefined) {
    return resolveHostLink(ctx, options.hostGroupId);
  }
  return {
    hostGroupId: options.existingHostGroupId ?? undefined,
    host: options.existingHost,
  };
}

/** After invoice host changes or link, mirror primary host onto linked series + events. */
export async function syncLinkedEventsPrimaryHostFromInvoice(
  ctx: MutationCtx,
  invoiceId: Id<"invoices">,
) {
  const invoice = await ctx.db.get(invoiceId);
  if (!invoice) return;
  const hostLink = invoice.groupId
    ? await resolveHostLink(ctx, invoice.groupId)
    : { hostGroupId: undefined, host: undefined };
  const now = Date.now();

  const series = await findSeriesByInvoiceId(ctx, invoiceId);
  if (series) {
    const additionalHostGroupIds = await resolveAdditionalHostGroupIds(
      ctx,
      hostLink.hostGroupId,
      series.additionalHostGroupIds,
    );
    await ctx.db.patch(series._id, {
      hostGroupId: hostLink.hostGroupId,
      host: hostLink.host,
      additionalHostGroupIds,
      updatedAt: now,
    });
  }

  const events = await listEventsByInvoiceId(ctx, invoiceId);
  for (const event of events) {
    const additionalHostGroupIds = await resolveAdditionalHostGroupIds(
      ctx,
      hostLink.hostGroupId,
      event.additionalHostGroupIds,
    );
    await ctx.db.patch(event._id, {
      hostGroupId: hostLink.hostGroupId,
      host: hostLink.host,
      additionalHostGroupIds,
      updatedAt: now,
    });
  }
}

/** Rewrite victim → survivor inside an additional-host id list; drop if survivor already primary or listed. */
export function rewriteAdditionalHostGroupIds(
  ids: Id<"invoiceGroups">[] | undefined,
  victimId: Id<"invoiceGroups">,
  survivorId: Id<"invoiceGroups">,
  primaryHostGroupId: Id<"invoiceGroups"> | undefined,
): Id<"invoiceGroups">[] | undefined {
  if (!ids || ids.length === 0) return undefined;
  const next: Id<"invoiceGroups">[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const mapped = id === victimId ? survivorId : id;
    if (primaryHostGroupId && mapped === primaryHostGroupId) continue;
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    next.push(mapped);
  }
  return next.length > 0 ? next : undefined;
}
