import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { inventoryR2 } from "../inventoryR2";
import { parseStoredR2Asset } from "./inventoryUpload";

/** Skip metadata newer than this during orphan sweeps (unsaved / in-flight uploads). */
export const R2_ORPHAN_GRACE_MS = 48 * 60 * 60 * 1000;

const R2_KEY_PREFIXES = [
  "inventory/",
  "events/",
  "users/",
  "marketing/",
  "organizations/",
  "venues/",
] as const;

/** Per-table scan caps for referenced-key collection. Hitting a cap marks the scan incomplete. */
const REFERENCE_SCAN_LIMITS = {
  inventoryPackages: 2000,
  inventoryTypes: 2000,
  organizationProfiles: 2000,
  eventMarketingDesigns: 2000,
  marketingPosts: 1000,
  eventArtifacts: 5000,
  venues: 1000,
  damageReports: 5000,
} as const;

export type ReferencedR2KeysScan = {
  keys: Set<string>;
  complete: boolean;
};

type LexicalJsonNode = {
  type?: string;
  src?: string;
  children?: LexicalJsonNode[];
};

function isR2ObjectKey(value: string): boolean {
  return R2_KEY_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function r2KeyFromReference(value: string | undefined): string | undefined {
  const parsed = parseStoredR2Asset(value);
  return parsed?.kind === "r2" ? parsed.key : undefined;
}

/** Accepts `r2:…` refs, bare object keys, or legacy raw keys (e.g. damage report photos). */
export function r2KeyFromStoredValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const fromReference = r2KeyFromReference(trimmed);
  if (fromReference) return fromReference;
  if (isR2ObjectKey(trimmed)) return trimmed;
  return undefined;
}

export function collectR2KeysFromResourceLinks(
  links: Array<{ url: string }> | undefined,
): string[] {
  const keys: string[] = [];
  for (const link of links ?? []) {
    const key = r2KeyFromReference(link.url);
    if (key) keys.push(key);
  }
  return keys;
}

function walkLexicalJsonTree(value: unknown, visit: (node: LexicalJsonNode) => void) {
  if (!value || typeof value !== "object") return;
  const record = value as LexicalJsonNode;
  if (typeof record.type === "string") {
    visit(record);
  }
  for (const child of record.children ?? []) {
    walkLexicalJsonTree(child, visit);
  }
}

export function collectR2KeysFromLexicalContentJson(contentJson: string | undefined): string[] {
  const keys = new Set<string>();
  if (!contentJson?.trim()) return [];

  try {
    const state = JSON.parse(contentJson) as { root?: LexicalJsonNode };
    if (!state.root) return [];
    walkLexicalJsonTree(state.root, (node) => {
      if (node.type !== "image" || typeof node.src !== "string") return;
      const key = r2KeyFromReference(node.src);
      if (key) keys.add(key);
    });
  } catch {
    return [];
  }

  return [...keys];
}

export function diffReleasedR2Keys(before: Iterable<string>, after: Iterable<string>): string[] {
  const afterSet = new Set(after);
  const released: string[] = [];
  for (const key of before) {
    if (!afterSet.has(key)) released.push(key);
  }
  return released;
}

export function keysToReleaseIfUnreferenced(
  candidates: Iterable<string>,
  referenced: Set<string>,
): string[] {
  const toRelease: string[] = [];
  const seen = new Set<string>();
  for (const key of candidates) {
    const trimmed = key.trim();
    if (!trimmed || seen.has(trimmed) || referenced.has(trimmed)) continue;
    seen.add(trimmed);
    toRelease.push(trimmed);
  }
  return toRelease;
}

async function releaseR2KeysDirect(ctx: MutationCtx, keys: Iterable<string>): Promise<void> {
  const seen = new Set<string>();
  for (const key of keys) {
    const trimmed = key.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    try {
      await inventoryR2.deleteObject(ctx, trimmed);
    } catch (error) {
      console.error(`R2 delete failed for key "${trimmed}":`, error);
    }
  }
}

/**
 * Delete R2 objects only when no remaining Convex row still references them.
 * Skips deletion entirely when the referenced-key scan was truncated.
 */
export async function releaseR2KeysIfUnreferenced(
  ctx: MutationCtx,
  keys: Iterable<string>,
): Promise<void> {
  const scan = await collectReferencedR2Keys(ctx);
  if (!scan.complete) {
    console.warn("Skipping R2 release: referenced-key scan hit a table limit.");
    return;
  }
  await releaseR2KeysDirect(ctx, keysToReleaseIfUnreferenced(keys, scan.keys));
}

export async function releaseReplacedR2Reference(
  ctx: MutationCtx,
  previous: string | undefined,
  next: string | undefined,
): Promise<void> {
  const oldKey = r2KeyFromReference(previous);
  const newKey = r2KeyFromReference(next);
  if (oldKey && oldKey !== newKey) {
    await releaseR2KeysIfUnreferenced(ctx, [oldKey]);
  }
}

export function collectKeysFromInventoryPackage(pkg: Pick<Doc<"inventoryPackages">, "publicHeroImageUrl">) {
  const key = r2KeyFromReference(pkg.publicHeroImageUrl);
  return key ? [key] : [];
}

export function collectKeysFromInventoryType(
  type: Pick<
    Doc<"inventoryTypes">,
    "iconImageUrl" | "promoImageUrl" | "manualUrls" | "categoryMetadata"
  >,
) {
  const keys = [
    ...collectR2KeysFromResourceLinks(type.manualUrls),
    ...collectR2KeysFromResourceLinks(type.categoryMetadata?.lighting?.gdtfUrls),
  ];
  for (const ref of [type.iconImageUrl, type.promoImageUrl]) {
    const key = r2KeyFromReference(ref);
    if (key) keys.push(key);
  }
  return keys;
}

export function collectKeysFromOrganizationProfile(
  profile: Pick<Doc<"organizationProfiles">, "publicHeroImageUrl">,
) {
  const key = r2KeyFromReference(profile.publicHeroImageUrl);
  return key ? [key] : [];
}

export function collectKeysFromEventMarketingDesign(
  design: Pick<Doc<"eventMarketingDesigns">, "imageUrl">,
) {
  const key = r2KeyFromReference(design.imageUrl);
  return key ? [key] : [];
}

export function collectKeysFromMarketingPost(
  post: Pick<Doc<"marketingPosts">, "heroImageUrl" | "contentJson">,
) {
  const keys = new Set<string>();
  const heroKey = r2KeyFromReference(post.heroImageUrl);
  if (heroKey) keys.add(heroKey);
  for (const key of collectR2KeysFromLexicalContentJson(post.contentJson)) {
    keys.add(key);
  }
  return [...keys];
}

export function collectKeysFromEventArtifact(artifact: Pick<Doc<"eventArtifacts">, "linkUrl">) {
  const key = r2KeyFromReference(artifact.linkUrl);
  return key ? [key] : [];
}

export function collectKeysFromVenue(venue: Pick<Doc<"venues">, "files">) {
  const keys: string[] = [];
  for (const file of venue.files ?? []) {
    const key = r2KeyFromStoredValue(file.r2Key);
    if (key) keys.push(key);
  }
  return keys;
}

export function collectKeysFromDamageReport(report: Pick<Doc<"damageReports">, "photoR2Key">) {
  const key = r2KeyFromStoredValue(report.photoR2Key);
  return key ? [key] : [];
}

function markScanComplete<T>(rows: T[], limit: number, complete: boolean): boolean {
  return complete && rows.length < limit;
}

/**
 * Walk product tables and return every R2 object key still referenced in Convex.
 * Used by the orphan sweeper — keep in sync with fields that store uploaded assets.
 */
export async function collectReferencedR2Keys(
  ctx: QueryCtx | MutationCtx,
): Promise<ReferencedR2KeysScan> {
  const keys = new Set<string>();
  let complete = true;

  const packages = await ctx.db
    .query("inventoryPackages")
    .take(REFERENCE_SCAN_LIMITS.inventoryPackages);
  complete = markScanComplete(packages, REFERENCE_SCAN_LIMITS.inventoryPackages, complete);
  for (const pkg of packages) {
    for (const key of collectKeysFromInventoryPackage(pkg)) keys.add(key);
  }

  const types = await ctx.db.query("inventoryTypes").take(REFERENCE_SCAN_LIMITS.inventoryTypes);
  complete = markScanComplete(types, REFERENCE_SCAN_LIMITS.inventoryTypes, complete);
  for (const type of types) {
    for (const key of collectKeysFromInventoryType(type)) keys.add(key);
  }

  const profiles = await ctx.db
    .query("organizationProfiles")
    .take(REFERENCE_SCAN_LIMITS.organizationProfiles);
  complete = markScanComplete(profiles, REFERENCE_SCAN_LIMITS.organizationProfiles, complete);
  for (const profile of profiles) {
    for (const key of collectKeysFromOrganizationProfile(profile)) keys.add(key);
  }

  const designs = await ctx.db
    .query("eventMarketingDesigns")
    .take(REFERENCE_SCAN_LIMITS.eventMarketingDesigns);
  complete = markScanComplete(designs, REFERENCE_SCAN_LIMITS.eventMarketingDesigns, complete);
  for (const design of designs) {
    for (const key of collectKeysFromEventMarketingDesign(design)) keys.add(key);
  }

  const posts = await ctx.db.query("marketingPosts").take(REFERENCE_SCAN_LIMITS.marketingPosts);
  complete = markScanComplete(posts, REFERENCE_SCAN_LIMITS.marketingPosts, complete);
  for (const post of posts) {
    for (const key of collectKeysFromMarketingPost(post)) keys.add(key);
  }

  const artifacts = await ctx.db
    .query("eventArtifacts")
    .take(REFERENCE_SCAN_LIMITS.eventArtifacts);
  complete = markScanComplete(artifacts, REFERENCE_SCAN_LIMITS.eventArtifacts, complete);
  for (const artifact of artifacts) {
    for (const key of collectKeysFromEventArtifact(artifact)) keys.add(key);
  }

  const venues = await ctx.db.query("venues").take(REFERENCE_SCAN_LIMITS.venues);
  complete = markScanComplete(venues, REFERENCE_SCAN_LIMITS.venues, complete);
  for (const venue of venues) {
    for (const key of collectKeysFromVenue(venue)) keys.add(key);
  }

  const damageReports = await ctx.db
    .query("damageReports")
    .take(REFERENCE_SCAN_LIMITS.damageReports);
  complete = markScanComplete(damageReports, REFERENCE_SCAN_LIMITS.damageReports, complete);
  for (const report of damageReports) {
    for (const key of collectKeysFromDamageReport(report)) keys.add(key);
  }

  return { keys, complete };
}

export function isWithinOrphanGracePeriod(lastModified: string | undefined, nowMs: number): boolean {
  if (!lastModified?.trim()) return true;
  const modifiedMs = Date.parse(lastModified);
  if (!Number.isFinite(modifiedMs)) return true;
  return nowMs - modifiedMs < R2_ORPHAN_GRACE_MS;
}
