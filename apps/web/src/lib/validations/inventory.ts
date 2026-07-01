import { z } from "zod";

export const lostFoundSettingsSchema = z.object({
  instructions: z.string().optional(),
  contactEmail: z.string().email("Enter a valid email").or(z.literal("")),
  infoUrl: z.string().url("Enter a valid URL").or(z.literal("")),
});

export type LostFoundSettingsFormValues = z.infer<typeof lostFoundSettingsSchema>;

export const storageLocationSchema = z.object({
  name: z.string().min(1, "Name is required"),
  parentId: z.string().optional(),
});

export type StorageLocationFormValues = z.infer<typeof storageLocationSchema>;

export const inventoryItemSchema = z.object({
  assetId: z.string().min(1, "Asset ID is required"),
  serialNumber: z.string().optional(),
  typeId: z.string().min(1, "Type is required"),
  storageLocationId: z.string().optional(),
  containedInAssetId: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

export type InventoryItemFormValues = z.infer<typeof inventoryItemSchema>;

export const publicPackageBucketSchema = z.enum([
  "lighting",
  "sound",
  "environmental",
  "staging",
  "misc",
]);

export const inventoryPackageItemSchema = z.object({
  typeId: z.string().min(1, "Type is required"),
  quantity: z.coerce.number().min(1, "Quantity must be at least 1"),
});

export const inventoryPackageSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    description: z.string().optional(),
    subsidizedPackagePriceUsd: z.coerce.number().min(0, "Price must be non-negative"),
    nonSubsidizedPackagePriceUsd: z.coerce.number().min(0, "Price must be non-negative"),
    active: z.boolean(),
    publicListing: z.boolean(),
    publicBucket: z.union([publicPackageBucketSchema, z.literal("")]),
    publicHeroImageUrl: z.string().optional(),
    publicSlug: z.string().optional(),
    items: z.array(inventoryPackageItemSchema).min(1, "Package must include at least one item"),
  })
  .refine((data) => !data.publicListing || data.publicBucket !== "", {
    message: "Choose a public browse section when listing publicly",
    path: ["publicBucket"],
  });

export type InventoryPackageFormValues = z.infer<typeof inventoryPackageSchema>;

export const resourceLinkSchema = z.object({
  title: z.string(),
  url: z.string(),
});

/** USD fields edited via number inputs may be stored as "" or a number. */
const optionalUsdField = z.union([
  z.literal(""),
  z.coerce.number().min(0, "Must be non-negative"),
]);

export const inventoryTypeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  model: z.string().min(1, "Model is required"),
  manufacturer: z.string().optional(),
  category: z.string().min(1, "Category is required"),
  msrpUsd: optionalUsdField,
  subsidizedRentalPriceUsd: optionalUsdField,
  nonSubsidizedRentalPriceUsd: optionalUsdField,
  manualResources: z.array(resourceLinkSchema),
  lightingGdtfResources: z.array(resourceLinkSchema),
  tips: z.string().optional(),
  capabilities: z.array(z.string()),
  iconImageUrl: z.string().optional(),
  promoImageUrl: z.string().optional(),
  publicListing: z.boolean(),
  publicProfile: z.boolean(),
  publicSlug: z.string().optional(),
});

export type InventoryTypeFormValues = z.infer<typeof inventoryTypeSchema>;
