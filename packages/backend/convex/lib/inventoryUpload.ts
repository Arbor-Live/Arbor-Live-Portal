export const inventoryUploadEntityKind = {
  package: "package",
  type: "type",
} as const;

export type InventoryUploadEntityKind =
  (typeof inventoryUploadEntityKind)[keyof typeof inventoryUploadEntityKind];

export const inventoryUploadPurpose = {
  hero: "hero",
  icon: "icon",
  promo: "promo",
  manual: "manual",
  gdtf: "gdtf",
} as const;

export type InventoryUploadPurpose =
  (typeof inventoryUploadPurpose)[keyof typeof inventoryUploadPurpose];

export const INVENTORY_R2_ASSET_PREFIX = "r2:";

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

function purposeFolder(purpose: InventoryUploadPurpose): string {
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
  }
}

export function buildInventoryObjectKey(args: {
  entityKind: InventoryUploadEntityKind;
  entityId?: string;
  purpose: InventoryUploadPurpose;
  fileName: string;
  uploadId: string;
}): string {
  const entitySegment = args.entityId?.trim() || `draft/${args.uploadId}`;
  const safeName = sanitizeInventoryFileName(args.fileName);
  const folder = purposeFolder(args.purpose);
  const plural = args.entityKind === "package" ? "packages" : "types";
  return `inventory/${plural}/${entitySegment}/${folder}/${args.uploadId}-${safeName}`;
}

export function validateInventoryUploadRequest(args: {
  entityKind: InventoryUploadEntityKind;
  purpose: InventoryUploadPurpose;
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

  if (args.purpose === "hero" || args.purpose === "icon" || args.purpose === "promo") {
    if (args.contentLength > IMAGE_MAX_BYTES) {
      throw new Error("Images must be 5 MB or smaller.");
    }
    if (!IMAGE_CONTENT_TYPES.has(contentType)) {
      throw new Error("Upload a JPEG, PNG, WebP, GIF, or SVG image.");
    }
    return;
  }

  if (args.purpose === "manual") {
    if (args.contentLength > DOCUMENT_MAX_BYTES) {
      throw new Error("Manuals must be 25 MB or smaller.");
    }
    const lowerName = fileName.toLowerCase();
    const allowedByType =
      MANUAL_CONTENT_TYPES.has(contentType) ||
      lowerName.endsWith(".pdf") ||
      lowerName.endsWith(".zip") ||
      lowerName.endsWith(".md") ||
      lowerName.endsWith(".txt");
    if (!allowedByType) {
      throw new Error("Upload a PDF, ZIP, Markdown, or plain-text manual.");
    }
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

export function formatStoredInventoryAsset(key: string): string {
  return `${INVENTORY_R2_ASSET_PREFIX}${key}`;
}

export function parseStoredInventoryAsset(
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
  if (value.startsWith(INVENTORY_R2_ASSET_PREFIX)) {
    const key = value.slice(INVENTORY_R2_ASSET_PREFIX.length).trim();
    return key ? { kind: "r2", key } : null;
  }
  if (value.startsWith("inventory/")) {
    return { kind: "r2", key: value };
  }
  return null;
}

function assertValidStoredAssetReference(raw: string, label: string): string {
  const parsed = parseStoredInventoryAsset(raw);
  if (!parsed) {
    throw new Error(`${label} must be an https URL or an uploaded R2 asset reference.`);
  }
  if (parsed.kind === "external") return parsed.url;
  return formatStoredInventoryAsset(parsed.key);
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

export function isStoredInventoryAsset(value: string | undefined): boolean {
  const parsed = parseStoredInventoryAsset(value);
  return parsed?.kind === "r2";
}

export function isImageAssetReference(value: string | undefined): boolean {
  const parsed = parseStoredInventoryAsset(value);
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
