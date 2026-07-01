import { R2 } from "@convex-dev/r2";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import {
  buildInventoryObjectKey,
  buildPublicAssetUrlFromKey,
  formatStoredInventoryAsset,
  parseStoredInventoryAsset,
  validateInventoryUploadRequest,
} from "./lib/inventoryUpload";

export const inventoryR2 = new R2(components.r2);

const PUBLIC_ASSET_URL_TTL_SECONDS = 60 * 60 * 24;

export async function resolveStoredInventoryAssetUrl(
  value: string | undefined,
  options?: { expiresIn?: number },
): Promise<string | undefined> {
  const parsed = parseStoredInventoryAsset(value);
  if (!parsed) return undefined;
  if (parsed.kind === "external") return parsed.url;

  const publicUrl = buildPublicAssetUrlFromKey(parsed.key);
  if (publicUrl) return publicUrl;

  return await inventoryR2.getUrl(parsed.key, {
    expiresIn: options?.expiresIn ?? PUBLIC_ASSET_URL_TTL_SECONDS,
  });
}

export const { syncMetadata, getMetadata } = inventoryR2.clientApi<DataModel>({
  checkUpload: async (ctx) => {
    await requireAuth(ctx);
  },
  checkReadKey: async (ctx) => {
    await requireAuth(ctx);
  },
});

export const generateInventoryUploadUrl = mutation({
  args: {
    entityKind: v.union(v.literal("package"), v.literal("type")),
    purpose: v.union(
      v.literal("hero"),
      v.literal("icon"),
      v.literal("promo"),
      v.literal("manual"),
      v.literal("gdtf"),
    ),
    entityId: v.optional(v.string()),
    fileName: v.string(),
    contentType: v.string(),
    contentLength: v.number(),
    uploadId: v.string(),
  },
  returns: v.object({
    key: v.string(),
    url: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireAuth(ctx);

    validateInventoryUploadRequest({
      entityKind: args.entityKind,
      purpose: args.purpose,
      fileName: args.fileName,
      contentType: args.contentType,
      contentLength: args.contentLength,
    });

    const uploadId = args.uploadId.trim();
    if (!uploadId) throw new Error("Upload id is required.");

    const key = buildInventoryObjectKey({
      entityKind: args.entityKind,
      entityId: args.entityId,
      purpose: args.purpose,
      fileName: args.fileName,
      uploadId,
    });

    return await inventoryR2.generateUploadUrl(key);
  },
});

export const resolveInventoryAssetUrl = query({
  args: { value: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const url = await resolveStoredInventoryAssetUrl(args.value);
    return url ?? null;
  },
});
