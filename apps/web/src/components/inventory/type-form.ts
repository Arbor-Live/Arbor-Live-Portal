import type { FunctionReturnType } from "convex/server";
import type { Tone } from "@/components/page-header";
import type { api } from "@/lib/convex-api";
import type { InventoryTypeFormValues } from "@/lib/validations/inventory";

export type InventoryTypeRow = FunctionReturnType<typeof api.inventoryTypes.list>["page"][number];

export type ResourceRow = { title: string; url: string };

export function emptyResourceRow(): ResourceRow {
  return { title: "", url: "" };
}

function resourcesFromDb(rows: { title: string; url: string }[] | undefined): ResourceRow[] {
  return rows?.length ? rows.map((row) => ({ title: row.title, url: row.url })) : [emptyResourceRow()];
}

export const defaultTypeValues: InventoryTypeFormValues = {
  name: "",
  description: "",
  model: "",
  manufacturer: "",
  category: "sound",
  msrpUsd: "",
  subsidizedRentalPriceUsd: "",
  nonSubsidizedRentalPriceUsd: "",
  manualResources: [emptyResourceRow()],
  lightingGdtfResources: [emptyResourceRow()],
  tips: "",
  capabilities: [],
  iconImageUrl: "",
  promoImageUrl: "",
  publicListing: false,
  publicProfile: false,
  publicSlug: "",
};

export function toTypeFormValues(row: InventoryTypeRow): InventoryTypeFormValues {
  return {
    name: row.name,
    description: row.description ?? "",
    model: row.model,
    manufacturer: row.manufacturer ?? "",
    category: row.category,
    msrpUsd: row.msrpUsd ?? "",
    subsidizedRentalPriceUsd: row.subsidizedRentalPriceUsd ?? "",
    nonSubsidizedRentalPriceUsd: row.nonSubsidizedRentalPriceUsd ?? row.rentalPriceUsd ?? "",
    manualResources: resourcesFromDb(row.manualUrls),
    lightingGdtfResources: resourcesFromDb(row.categoryMetadata?.lighting?.gdtfUrls),
    tips: row.tips ?? "",
    capabilities: row.capabilities,
    iconImageUrl: row.iconImageUrl ?? "",
    promoImageUrl: row.promoImageUrl ?? "",
    publicListing: Boolean(row.publicListing),
    publicProfile: Boolean(row.publicProfile),
    publicSlug: row.publicSlug ?? "",
  };
}

export function buildTypePayload(values: InventoryTypeFormValues, editingRow?: InventoryTypeRow) {
  const manualUrls = values.manualResources
    .filter((row) => row.url.trim())
    .map((row) => ({ title: row.title.trim() || "Manual", url: row.url.trim() }));

  const categoryMetadata =
    values.category === "lighting"
      ? {
          lighting: {
            ...(editingRow?.categoryMetadata?.lighting ?? {}),
            gdtfUrls: values.lightingGdtfResources
              .filter((row) => row.url.trim())
              .map((row) => ({ title: row.title.trim() || "GDTF", url: row.url.trim() })),
          },
        }
      : {};

  const toOptionalNumber = (value: string | number | "" | undefined) =>
    value === "" || value === undefined ? undefined : Number(value);

  return {
    name: values.name,
    description: values.description || undefined,
    model: values.model,
    manufacturer: values.manufacturer || undefined,
    category: values.category,
    msrpUsd: toOptionalNumber(values.msrpUsd),
    subsidizedRentalPriceUsd: toOptionalNumber(values.subsidizedRentalPriceUsd),
    nonSubsidizedRentalPriceUsd: toOptionalNumber(values.nonSubsidizedRentalPriceUsd),
    manualUrls,
    tips: values.tips || undefined,
    capabilities: values.capabilities.map((entry) => entry.trim().toLowerCase()).filter(Boolean),
    iconImageUrl: values.iconImageUrl || undefined,
    promoImageUrl: values.promoImageUrl || undefined,
    publicListing: values.publicListing,
    publicProfile: values.publicProfile,
    publicSlug: values.publicSlug?.trim() || undefined,
    categoryMetadata,
  };
}

/**
 * A unit count for display. `unitCounts` scans a bounded window of items, so
 * once it's truncated every count is a floor ("3+ units").
 */
export function formatUnitCount(count: number, truncated: boolean) {
  return `${count}${truncated ? "+" : ""} unit${count === 1 && !truncated ? "" : "s"}`;
}

/** How far a type is published: hidden, on the public browse pages, or with its full profile. */
export type TypeVisibility = "hidden" | "listing" | "profile";

export function typeVisibility(row: { publicListing?: boolean; publicProfile?: boolean }): TypeVisibility {
  if (!row.publicListing) return "hidden";
  return row.publicProfile ? "profile" : "listing";
}

export const TYPE_VISIBILITY_LABELS: Record<TypeVisibility, string> = {
  hidden: "Hidden",
  listing: "Public listing",
  profile: "Public + profile",
};

export const TYPE_VISIBILITY_TONES: Record<TypeVisibility, Tone> = {
  hidden: "neutral",
  listing: "blue",
  profile: "emerald",
};
