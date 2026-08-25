export const inventoryUploadEntityKind = {
  package: "package",
  type: "type",
  item: "item",
} as const;

export type InventoryUploadEntityKind =
  (typeof inventoryUploadEntityKind)[keyof typeof inventoryUploadEntityKind];

export const inventoryUploadPurpose = {
  hero: "hero",
  icon: "icon",
  promo: "promo",
  manual: "manual",
  gdtf: "gdtf",
  damage: "damage",
  artifact: "artifact",
} as const;

export type InventoryUploadPurpose =
  (typeof inventoryUploadPurpose)[keyof typeof inventoryUploadPurpose];

export type InventoryFilePurpose = Exclude<InventoryUploadPurpose, "artifact">;

export const R2_ASSET_PREFIX = "r2:";
/** @deprecated Use R2_ASSET_PREFIX */
export const INVENTORY_R2_ASSET_PREFIX = R2_ASSET_PREFIX;

const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DOCUMENT_MAX_BYTES = 25 * 1024 * 1024;

const IMAGE_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

const MANUAL_CONTENT_TYPES = new Set([
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/markdown",
]);

const GDTF_CONTENT_TYPES = new Set([
  "application/zip",
  "application/x-zip-compressed",
  "application/octet-stream",
  "application/xml",
  "text/xml",
]);

export function sanitizeInventoryFileName(fileName: string): string {
  const baseName = fileName.split(/[/\\]/).pop()?.trim() || "file";
  const sanitized = baseName.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
  return sanitized.slice(0, 120) || "file";
}

export function defaultTitleFromFileName(fileName: string, fallback: string): string {
  const baseName = fileName.split(/[/\\]/).pop()?.trim();
  if (!baseName) return fallback;
  const withoutExt = baseName.replace(/\.[^.]+$/, "").trim();
  return withoutExt || fallback;
}

function purposeFolder(purpose: InventoryFilePurpose): string {
  switch (purpose) {
    case "hero":
      return "hero";
    case "icon":
      return "icon";
    case "promo":
      return "promo";
    case "manual":
      return "manuals";
    case "gdtf":
      return "gdtf";
    case "damage":
      return "damage";
  }
}

function entityKindFolder(entityKind: InventoryUploadEntityKind): string {
  switch (entityKind) {
    case "package":
      return "packages";
    case "type":
      return "types";
    case "item":
      return "items";
  }
}

export function buildInventoryObjectKey(args: {
  entityKind: InventoryUploadEntityKind;
  entityId?: string;
  purpose: InventoryFilePurpose;
  fileName: string;
  uploadId: string;
}): string {
  const entitySegment = args.entityId?.trim() || `draft/${args.uploadId}`;
  const safeName = sanitizeInventoryFileName(args.fileName);
  const folder = purposeFolder(args.purpose);
  const plural = entityKindFolder(args.entityKind);
  return `inventory/${plural}/${entitySegment}/${folder}/${args.uploadId}-${safeName}`;
}

export function buildEventArtifactObjectKey(args: {
  eventId: string;
  fileName: string;
  uploadId: string;
}): string {
  const eventSegment = args.eventId.trim() || `draft/${args.uploadId}`;
  const safeName = sanitizeInventoryFileName(args.fileName);
  return `events/${eventSegment}/artifacts/${args.uploadId}-${safeName}`;
}

export function buildEventPosterObjectKey(args: {
  eventId: string;
  fileName: string;
  uploadId: string;
}): string {
  const eventSegment = args.eventId.trim() || `draft/${args.uploadId}`;
  const safeName = sanitizeInventoryFileName(args.fileName);
  return `events/${eventSegment}/poster/${args.uploadId}-${safeName}`;
}

export function buildVenueDocumentObjectKey(args: {
  venueId?: string;
  fileName: string;
  uploadId: string;
}): string {
  const venueSegment = args.venueId?.trim() || `draft/${args.uploadId}`;
  const safeName = sanitizeInventoryFileName(args.fileName);
  return `venues/${venueSegment}/documents/${args.uploadId}-${safeName}`;
}

export function buildMarketingPostHeroObjectKey(args: {
  postId?: string;
  fileName: string;
  uploadId: string;
}): string {
  const postSegment = args.postId?.trim() || `draft/${args.uploadId}`;
  const safeName = sanitizeInventoryFileName(args.fileName);
  return `marketing/posts/${postSegment}/hero/${args.uploadId}-${safeName}`;
}

export function buildMarketingPostContentObjectKey(args: {
  postId?: string;
  fileName: string;
  uploadId: string;
}): string {
  const postSegment = args.postId?.trim() || `draft/${args.uploadId}`;
  const safeName = sanitizeInventoryFileName(args.fileName);
  return `marketing/posts/${postSegment}/content/${args.uploadId}-${safeName}`;
}

export function buildBandHeroObjectKey(args: {
  organizationId: string;
  fileName: string;
  uploadId: string;
}): string {
  const orgSegment = args.organizationId.trim() || `draft/${args.uploadId}`;
  const safeName = sanitizeInventoryFileName(args.fileName);
  return `organizations/bands/${orgSegment}/hero/${args.uploadId}-${safeName}`;
}

export function validateMarketingHeroUploadRequest(args: {
  fileName: string;
  contentType: string;
  contentLength: number;
}): void {
  const contentType = args.contentType.trim().toLowerCase() || "application/octet-stream";
  const fileName = args.fileName.trim();
  if (!fileName) throw new Error("File name is required.");
  if (args.contentLength <= 0) throw new Error("File size must be greater than zero.");
  validateImageUpload(contentType, args.contentLength);
}

function validateImageUpload(contentType: string, contentLength: number): void {
  if (contentLength > IMAGE_MAX_BYTES) {
    throw new Error("Images must be 5 MB or smaller.");
  }
  if (!IMAGE_CONTENT_TYPES.has(contentType)) {
    throw new Error("Upload a JPEG, PNG, WebP, GIF, or SVG image.");
  }
}

function validateDocumentUpload(
  contentType: string,
  contentLength: number,
  fileName: string,
  label: string,
): void {
  if (contentLength > DOCUMENT_MAX_BYTES) {
    throw new Error(`${label} must be 25 MB or smaller.`);
  }
  const lowerName = fileName.toLowerCase();
  const allowedByType =
    MANUAL_CONTENT_TYPES.has(contentType) ||
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".zip") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".doc") ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".xls") ||
    lowerName.endsWith(".xlsx");
  if (!allowedByType) {
    throw new Error(`Upload a supported ${label.toLowerCase()} (PDF, ZIP, text, or Office doc).`);
  }
}

export function validateEventArtifactUploadRequest(args: {
  fileName: string;
  contentType: string;
  contentLength: number;
}): void {
  const contentType = args.contentType.trim().toLowerCase() || "application/octet-stream";
  const fileName = args.fileName.trim();
  if (!fileName) throw new Error("File name is required.");
  if (args.contentLength <= 0) throw new Error("File size must be greater than zero.");

  const lowerName = fileName.toLowerCase();
  const isImage =
    IMAGE_CONTENT_TYPES.has(contentType) ||
    /\.(png|jpe?g|webp|gif|svg)$/i.test(lowerName);
  if (isImage) {
    validateImageUpload(contentType, args.contentLength);
    return;
  }
  validateDocumentUpload(contentType, args.contentLength, fileName, "Event file");
}

export function validateVenueDocumentUploadRequest(args: {
  fileName: string;
  contentType: string;
  contentLength: number;
}): void {
  const contentType = args.contentType.trim().toLowerCase() || "application/octet-stream";
  const fileName = args.fileName.trim();
  if (!fileName) throw new Error("File name is required.");
  if (args.contentLength <= 0) throw new Error("File size must be greater than zero.");
  if (args.contentLength > DOCUMENT_MAX_BYTES) {
    throw new Error("Venue files must be 25 MB or smaller.");
  }

  const lowerName = fileName.toLowerCase();
  const allowed =
    MANUAL_CONTENT_TYPES.has(contentType) ||
    GDTF_CONTENT_TYPES.has(contentType) ||
    contentType === "application/octet-stream" ||
    lowerName.endsWith(".pdf") ||
    lowerName.endsWith(".zip") ||
    lowerName.endsWith(".vwx") ||
    lowerName.endsWith(".dwg") ||
    lowerName.endsWith(".dxf") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".doc") ||
    lowerName.endsWith(".docx") ||
    lowerName.endsWith(".xls") ||
    lowerName.endsWith(".xlsx");
  if (!allowed) {
    throw new Error("Upload a supported venue file (PDF, ZIP, VWX, CAD, text, or Office doc).");
  }
}

export function validateInventoryUploadRequest(args: {
  entityKind: InventoryUploadEntityKind;
  purpose: InventoryFilePurpose;
  fileName: string;
  contentType: string;
  contentLength: number;
}): void {
  const contentType = args.contentType.trim().toLowerCase() || "application/octet-stream";
  const fileName = args.fileName.trim();
  if (!fileName) throw new Error("File name is required.");
  if (args.contentLength <= 0) throw new Error("File size must be greater than zero.");

  if (args.entityKind === "package" && args.purpose !== "hero") {
    throw new Error("Packages only support hero image uploads.");
  }

  if (args.entityKind === "type" && args.purpose === "hero") {
    throw new Error("Hero uploads are only supported for packages.");
  }

  if (args.entityKind === "item") {
    if (args.purpose !== "damage") {
      throw new Error("Inventory items only support damage photo uploads.");
    }
    validateImageUpload(contentType, args.contentLength);
    return;
  }

  if (args.purpose === "damage") {
    throw new Error("Damage photos are only supported for inventory items.");
  }

  if (args.purpose === "hero" || args.purpose === "icon" || args.purpose === "promo") {
    validateImageUpload(contentType, args.contentLength);
    return;
  }

  if (args.purpose === "manual") {
    validateDocumentUpload(contentType, args.contentLength, fileName, "Manual");
    return;
  }

  if (args.contentLength > DOCUMENT_MAX_BYTES) {
    throw new Error("GDTF files must be 25 MB or smaller.");
  }
  const lowerName = fileName.toLowerCase();
  const allowedGdtf =
    GDTF_CONTENT_TYPES.has(contentType) ||
    lowerName.endsWith(".gdtf") ||
    lowerName.endsWith(".zip");
  if (!allowedGdtf) {
    throw new Error("Upload a .gdtf or .zip GDTF file.");
  }
}

export function formatStoredR2Asset(key: string): string {
  return `${R2_ASSET_PREFIX}${key}`;
}

/** @deprecated Use formatStoredR2Asset */
export const formatStoredInventoryAsset = formatStoredR2Asset;

export function parseStoredR2Asset(
  raw: string | undefined,
):
  | { kind: "external"; url: string }
  | { kind: "r2"; key: string }
  | null {
  const value = raw?.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) {
    return { kind: "external", url: value };
  }
  if (value.startsWith(R2_ASSET_PREFIX)) {
    const key = value.slice(R2_ASSET_PREFIX.length).trim();
    return key ? { kind: "r2", key } : null;
  }
  if (
    value.startsWith("inventory/") ||
    value.startsWith("events/") ||
    value.startsWith("users/") ||
    value.startsWith("marketing/") ||
    value.startsWith("organizations/")
  ) {
    return { kind: "r2", key: value };
  }
  return null;
}

/** @deprecated Use parseStoredR2Asset */
export const parseStoredInventoryAsset = parseStoredR2Asset;

function assertValidStoredAssetReference(raw: string, label: string): string {
  const parsed = parseStoredR2Asset(raw);
  if (!parsed) {
    throw new Error(`${label} must be an https URL or an uploaded R2 asset reference.`);
  }
  if (parsed.kind === "external") return parsed.url;
  return formatStoredR2Asset(parsed.key);
}

export function normalizeOptionalAssetReference(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  return assertValidStoredAssetReference(value, "Asset reference");
}

export function normalizeResourceLinksForUpload(
  entries: Array<{ title?: string; url: string }> | undefined,
  defaultTitle: string,
): Array<{ title: string; url: string }> {
  return (entries ?? [])
    .map((entry) => ({
      title: (entry.title?.trim() || defaultTitle).trim(),
      url: entry.url.trim(),
    }))
    .filter((entry) => entry.url.length > 0)
    .map((entry) => ({
      title: entry.title,
      url: assertValidStoredAssetReference(entry.url, `Resource "${entry.title}"`),
    }));
}

export function isStoredR2Asset(value: string | undefined): boolean {
  const parsed = parseStoredR2Asset(value);
  return parsed?.kind === "r2";
}

/** @deprecated Use isStoredR2Asset */
export const isStoredInventoryAsset = isStoredR2Asset;

export function isImageAssetReference(value: string | undefined): boolean {
  const parsed = parseStoredR2Asset(value);
  if (!parsed) return false;
  if (parsed.kind === "external") {
    return /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(parsed.url);
  }
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(parsed.key);
}

export function getInventoryPublicBaseUrl(): string | undefined {
  const base = process.env.R2_PUBLIC_BASE_URL?.trim();
  return base ? base.replace(/\/$/, "") : undefined;
}

export function buildPublicAssetUrlFromKey(key: string, publicBaseUrl?: string): string | undefined {
  const base = publicBaseUrl ?? getInventoryPublicBaseUrl();
  if (!base) return undefined;
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${base}/${encodedKey}`;
}
