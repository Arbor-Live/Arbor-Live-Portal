import { R2 } from "@convex-dev/r2";
import { v } from "convex/values";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";
import {
  buildEventArtifactObjectKey,
  buildInventoryObjectKey,
  buildPublicAssetUrlFromKey,
  formatStoredR2Asset,
  parseStoredR2Asset,
  validateEventArtifactUploadRequest,
  validateInventoryUploadRequest,
} from "./lib/inventoryUpload";

export const inventoryR2 = new R2(components.r2);

const PUBLIC_ASSET_URL_TTL_SECONDS = 60 * 60 * 24;

export async function resolveStoredR2AssetUrl(
  value: string | undefined,
  options?: { expiresIn?: number },
): Promise<string | undefined> {
  const parsed = parseStoredR2Asset(value);
  if (!parsed) return undefined;
  if (parsed.kind === "external") return parsed.url;

  const publicUrl = buildPublicAssetUrlFromKey(parsed.key);
  if (publicUrl) return publicUrl;

  return await inventoryR2.getUrl(parsed.key, {
    expiresIn: options?.expiresIn ?? PUBLIC_ASSET_URL_TTL_SECONDS,
  });
}

/** @deprecated Use resolveStoredR2AssetUrl */
export const resolveStoredInventoryAssetUrl = resolveStoredR2AssetUrl;

export const { syncMetadata, getMetadata } = inventoryR2.clientApi<DataModel>({
  checkUpload: async (ctx) => {
    await requireAuth(ctx);
  },
  checkReadKey: async (ctx) => {
    await requireAuth(ctx);
  },
});

const uploadScopeValue = v.union(v.literal("inventory"), v.literal("event"));

const inventoryPurposeValue = v.union(
  v.literal("hero"),
  v.literal("icon"),
  v.literal("promo"),
  v.literal("manual"),
  v.literal("gdtf"),
);

export const generateR2UploadUrl = mutation({
  args: {
    scope: uploadScopeValue,
    entityKind: v.optional(v.union(v.literal("package"), v.literal("type"))),
    purpose: v.union(inventoryPurposeValue, v.literal("artifact")),
    entityId: v.optional(v.string()),
    eventId: v.optional(v.id("events")),
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

    const uploadId = args.uploadId.trim();
    if (!uploadId) throw new Error("Upload id is required.");

    let key: string;
    if (args.scope === "event") {
      if (!args.eventId) throw new Error("Event id is required for event uploads.");
      validateEventArtifactUploadRequest({
        fileName: args.fileName,
        contentType: args.contentType,
        contentLength: args.contentLength,
      });
      key = buildEventArtifactObjectKey({
        eventId: args.eventId,
        fileName: args.fileName,
        uploadId,
      });
    } else {
      if (!args.entityKind) throw new Error("Inventory entity kind is required.");
      if (args.purpose === "artifact") {
        throw new Error("Artifact purpose is only valid for event uploads.");
      }
      validateInventoryUploadRequest({
        entityKind: args.entityKind,
        purpose: args.purpose,
        fileName: args.fileName,
        contentType: args.contentType,
        contentLength: args.contentLength,
      });
      key = buildInventoryObjectKey({
        entityKind: args.entityKind,
        entityId: args.entityId,
        purpose: args.purpose,
        fileName: args.fileName,
        uploadId,
      });
    }

    return await inventoryR2.generateUploadUrl(key);
  },
});

export const generateInventoryUploadUrl = mutation({
  args: {
    entityKind: v.union(v.literal("package"), v.literal("type")),
    purpose: inventoryPurposeValue,
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

export const resolveAssetUrl = query({
  args: { value: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    await requireAuth(ctx);
    const url = await resolveStoredR2AssetUrl(args.value);
    return url ?? null;
  },
});

/** @deprecated Use resolveAssetUrl */
export const resolveInventoryAssetUrl = resolveAssetUrl;

export { formatStoredR2Asset };
