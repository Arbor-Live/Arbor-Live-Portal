import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbCtx = MutationCtx | QueryCtx;

export type AliasSource = "manual" | "merge" | "rename";

/** Lowercase, trim, collapse whitespace. Used for exact reuse matching. */
export function normalizeHostOrgName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function findGroupByNormalizedName(
  ctx: DbCtx,
  normalized: string,
): Promise<Doc<"invoiceGroups"> | null> {
  if (!normalized) return null;
  const byIndex = await ctx.db
    .query("invoiceGroups")
    .withIndex("by_normalizedName", (q) => q.eq("normalizedName", normalized))
    .first();
  if (byIndex) return byIndex;

  // Legacy rows may lack normalizedName until backfill.
  const legacy = await ctx.db.query("invoiceGroups").take(500);
  return (
    legacy.find(
      (group) => group.active && normalizeHostOrgName(group.name) === normalized,
    ) ?? null
  );
}

export async function findGroupByNameOrAlias(
  ctx: DbCtx,
  name: string,
): Promise<Doc<"invoiceGroups"> | null> {
  const normalized = normalizeHostOrgName(name);
  if (!normalized) return null;

  const alias = await ctx.db
    .query("invoiceGroupAliases")
    .withIndex("by_normalizedAlias", (q) => q.eq("normalizedAlias", normalized))
    .first();
  if (alias) {
    const group = await ctx.db.get(alias.groupId);
    if (group?.active) return group;
  }

  const byName = await findGroupByNormalizedName(ctx, normalized);
  if (byName?.active) return byName;
  return null;
}

export async function ensureAlias(
  ctx: MutationCtx,
  groupId: Id<"invoiceGroups">,
  aliasRaw: string,
  source: AliasSource,
): Promise<boolean> {
  const alias = aliasRaw.trim();
  const normalizedAlias = normalizeHostOrgName(alias);
  if (!normalizedAlias) return false;

  const group = await ctx.db.get(groupId);
  if (!group) throw new Error("Host organization not found.");
  if (normalizeHostOrgName(group.name) === normalizedAlias) return false;

  const existingForGroup = await ctx.db
    .query("invoiceGroupAliases")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .take(100);
  if (existingForGroup.some((row) => row.normalizedAlias === normalizedAlias)) {
    return false;
  }

  const claimed = await ctx.db
    .query("invoiceGroupAliases")
    .withIndex("by_normalizedAlias", (q) => q.eq("normalizedAlias", normalizedAlias))
    .first();
  if (claimed && claimed.groupId !== groupId) {
    throw new Error(`Alias "${alias}" is already used by another host organization.`);
  }

  const otherGroup = await findGroupByNormalizedName(ctx, normalizedAlias);
  if (otherGroup && otherGroup._id !== groupId && otherGroup.active) {
    throw new Error(`Alias "${alias}" matches another active host organization.`);
  }

  await ctx.db.insert("invoiceGroupAliases", {
    groupId,
    alias,
    normalizedAlias,
    source,
    createdAt: Date.now(),
  });
  return true;
}

export async function listAliasesForGroup(ctx: DbCtx, groupId: Id<"invoiceGroups">) {
  return await ctx.db
    .query("invoiceGroupAliases")
    .withIndex("by_groupId", (q) => q.eq("groupId", groupId))
    .take(100);
}

/** Token/substring search over active groups + aliases (bounded catalog). */
export async function searchHostOrganizations(
  ctx: DbCtx,
  queryRaw: string,
  limit = 20,
): Promise<Array<Doc<"invoiceGroups">>> {
  const query = normalizeHostOrgName(queryRaw);
  if (!query || query.length < 1) return [];

  const tokens = query.split(" ").filter(Boolean);
  const groups = await ctx.db
    .query("invoiceGroups")
    .withIndex("by_active", (q) => q.eq("active", true))
    .take(500);
  const aliases = await ctx.db.query("invoiceGroupAliases").take(2000);
  const aliasesByGroup = new Map<string, string[]>();
  for (const alias of aliases) {
    const list = aliasesByGroup.get(alias.groupId) ?? [];
    list.push(alias.normalizedAlias);
    aliasesByGroup.set(alias.groupId, list);
  }

  const scored: Array<{ group: Doc<"invoiceGroups">; score: number }> = [];
  for (const group of groups) {
    const primary = group.normalizedName ?? normalizeHostOrgName(group.name);
    const haystacks = [primary, ...(aliasesByGroup.get(group._id) ?? [])];
    let best = 0;
    for (const hay of haystacks) {
      if (hay === query) {
        best = Math.max(best, 100);
        continue;
      }
      if (hay.startsWith(query)) {
        best = Math.max(best, 80);
        continue;
      }
      if (hay.includes(query)) {
        best = Math.max(best, 60);
        continue;
      }
      if (tokens.length > 1 && tokens.every((token) => hay.includes(token))) {
        best = Math.max(best, 50);
      }
    }
    if (best > 0) scored.push({ group, score: best });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.group.name.localeCompare(b.group.name))
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map((row) => row.group);
}

export function contactRichnessScore(contact: {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  name?: string;
}): number {
  return (
    (contact.firstName?.trim() ? 1 : 0) +
    (contact.lastName?.trim() ? 1 : 0) +
    (contact.phone?.trim() ? 1 : 0) +
    (contact.email?.trim() ? 1 : 0) +
    (contact.name?.trim() ? 0.5 : 0)
  );
}
