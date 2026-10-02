import type { FunctionReturnType } from "convex/server";
import type { Tone } from "@/components/page-header";
import { api, type Id } from "@/lib/convex-api";
import type { InventoryPackageFormValues } from "@/lib/validations/inventory";
import type { ContentUnitDraft } from "./package-items-editor";
import { bucketForCategoryKey, sectionOrder, type PublicPackageBucket } from "./package-section-utils";

export type PackageRow = FunctionReturnType<typeof api.inventoryPackages.list>[number];

export type PackageStatus = "listed" | "internal" | "inactive";

export const PACKAGE_STATUS_LABELS: Record<PackageStatus, string> = {
  listed: "Listed publicly",
  internal: "Internal",
  inactive: "Inactive",
};

export const PACKAGE_STATUS_TONES: Record<PackageStatus, Tone> = {
  listed: "emerald",
  internal: "neutral",
  inactive: "rose",
};

/** Inactive wins: an inactive package is off the public pages even while `publicListing` stays set. */
export function packageStatus(pkg: { active: boolean; publicListing?: boolean }): PackageStatus {
  if (!pkg.active) return "inactive";
  return pkg.publicListing ? "listed" : "internal";
}

export const defaultPackageValues: InventoryPackageFormValues = {
  name: "",
  description: "",
  subsidizedPackagePriceUsd: 0,
  nonSubsidizedPackagePriceUsd: 0,
  active: true,
  publicListing: false,
  publicBucket: "",
  publicHeroImageUrl: "",
  publicSlug: "",
  contents: [],
};

function parsePositiveInt(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
}

export function contentsFromDraft(units: ContentUnitDraft[]): InventoryPackageFormValues["contents"] {
  return units.map((unit) => ({
    quantity: parsePositiveInt(unit.quantity),
    options: unit.options.map((option) => ({
      name: option.name.trim() || undefined,
      items: option.items
        .filter((item) => item.typeId)
        .map((item) => ({
          typeId: item.typeId,
          quantity: parsePositiveInt(item.quantity),
          role: item.role,
        })),
    })),
  }));
}

export function draftFromContents(
  contents: Array<{
    quantity: number;
    options: Array<{
      name?: string;
      items: Array<{ typeId: string; quantity: number; role: "primary" | "accessory" }>;
    }>;
  }>,
): ContentUnitDraft[] {
  return contents.map((unit, unitIndex) => ({
    key: `loaded-unit-${unitIndex}`,
    quantity: String(unit.quantity),
    options: unit.options.map((option, optionIndex) => ({
      key: `loaded-option-${unitIndex}-${optionIndex}`,
      name: option.name ?? "",
      items: option.items.map((item) => ({
        typeId: item.typeId,
        quantity: String(item.quantity),
        role: item.role,
      })),
    })),
  }));
}

export function toPackageFormValues(pkg: PackageRow, units: ContentUnitDraft[]): InventoryPackageFormValues {
  return {
    name: pkg.name,
    description: pkg.description ?? "",
    subsidizedPackagePriceUsd: pkg.subsidizedPackagePriceUsd ?? 0,
    nonSubsidizedPackagePriceUsd: pkg.nonSubsidizedPackagePriceUsd ?? pkg.packagePriceCents / 100,
    active: pkg.active,
    publicListing: Boolean(pkg.publicListing),
    publicBucket: (pkg.publicBucket ?? "") as InventoryPackageFormValues["publicBucket"],
    publicHeroImageUrl: pkg.publicHeroImageUrl ?? "",
    publicSlug: pkg.publicSlug ?? "",
    contents: contentsFromDraft(units),
  };
}

export function buildPackagePayload(values: InventoryPackageFormValues, units: ContentUnitDraft[]) {
  const contents = contentsFromDraft(units)
    .map((unit) => ({
      quantity: unit.quantity,
      options: unit.options
        .map((option) => ({
          ...(option.name ? { name: option.name } : {}),
          items: option.items.map((item) => ({
            typeId: item.typeId as Id<"inventoryTypes">,
            quantity: item.quantity,
            role: item.role,
          })),
        }))
        .filter((option) => option.items.length > 0),
    }))
    .filter((unit) => unit.options.length > 0);

  return {
    name: values.name,
    description: values.description || undefined,
    packagePriceCents: Math.round(values.nonSubsidizedPackagePriceUsd * 100),
    subsidizedPackagePriceUsd: values.subsidizedPackagePriceUsd,
    nonSubsidizedPackagePriceUsd: values.nonSubsidizedPackagePriceUsd,
    active: values.active,
    publicListing: values.publicListing,
    publicBucket:
      values.publicListing && values.publicBucket ? (values.publicBucket as PublicPackageBucket) : undefined,
    publicHeroImageUrl: values.publicHeroImageUrl?.trim() || undefined,
    publicSlug: values.publicSlug?.trim() || undefined,
    contents,
  };
}

/** The non-subsidized price, falling back to the legacy cents field. */
export function packagePriceUsd(pkg: PackageRow) {
  return pkg.nonSubsidizedPackagePriceUsd ?? pkg.packagePriceCents / 100;
}

/** "2× SM58 · 1× (Kit A / Kit B)": one entry per content unit, alternatives in brackets. */
export function packageContentsSummary(pkg: PackageRow) {
  const contents = pkg.contents ?? [];
  if (!contents.length) return "No contents yet";
  return contents
    .map((unit) => {
      const labels = unit.options.map((option) => option.name).join(" / ");
      return unit.exclusive ? `${unit.quantity}× (${labels})` : `${unit.quantity}× ${labels}`;
    })
    .join(" · ");
}

/**
 * The section a package is grouped under: its public browse section when
 * listed, otherwise the section most of its gear falls in.
 */
export function packageSection(
  pkg: PackageRow,
  categories: Array<{ key: string; publicBucket?: PublicPackageBucket | null }> | undefined,
): PublicPackageBucket {
  if (pkg.publicListing && pkg.publicBucket) return pkg.publicBucket;
  const counts = new Map<PublicPackageBucket, number>();
  const categorySources = [
    ...pkg.items.map((item) => item.type?.category),
    ...(pkg.contents ?? []).flatMap((unit) =>
      unit.options.flatMap((option) => option.items.map((item) => item.type?.category)),
    ),
  ];
  for (const category of categorySources) {
    if (!category) continue;
    const bucket = bucketForCategoryKey(category, categories);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  let dominant: PublicPackageBucket = "misc";
  let max = 0;
  for (const section of sectionOrder) {
    const count = counts.get(section) ?? 0;
    if (count > max) {
      max = count;
      dominant = section;
    }
  }
  return dominant;
}

/** Every type a package touches, for the type and inventory-item filters. */
export function packageTypeIds(pkg: PackageRow) {
  return [
    ...pkg.items.map((row) => row.typeId as string),
    ...(pkg.contents ?? []).flatMap((unit) =>
      unit.options.flatMap((option) => option.items.map((item) => item.typeId as string)),
    ),
  ];
}
