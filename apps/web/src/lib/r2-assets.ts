export const R2_ASSET_PREFIX = "r2:";

/** @deprecated Use R2_ASSET_PREFIX */
export const INVENTORY_R2_ASSET_PREFIX = R2_ASSET_PREFIX;

export function formatStoredR2Asset(key: string): string {
  return `${R2_ASSET_PREFIX}${key}`;
}

/** @deprecated Use formatStoredR2Asset */
export const formatStoredInventoryAsset = formatStoredR2Asset;

export function isImageAssetReference(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    return /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(trimmed);
  }
  const key = trimmed.startsWith(R2_ASSET_PREFIX)
    ? trimmed.slice(R2_ASSET_PREFIX.length)
    : trimmed;
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(key);
}

export function defaultTitleFromFileName(fileName: string, fallback: string): string {
  const baseName = fileName.split(/[/\\]/).pop()?.trim();
  if (!baseName) return fallback;
  const withoutExt = baseName.replace(/\.[^.]+$/, "").trim();
  return withoutExt || fallback;
}

export function defaultAcceptForPurpose(
  purpose: "hero" | "icon" | "promo" | "manual" | "gdtf" | "artifact",
): string {
  switch (purpose) {
    case "hero":
    case "icon":
    case "promo":
      return "image/jpeg,image/png,image/webp,image/gif,image/svg+xml";
    case "manual":
      return "application/pdf,.pdf,.zip,.md,.txt,text/plain,text/markdown";
    case "gdtf":
      return ".gdtf,.zip,application/zip,application/octet-stream";
    case "artifact":
      return "image/jpeg,image/png,image/webp,image/gif,image/svg+xml,application/pdf,.pdf,.zip,.md,.txt,.doc,.docx,.xls,.xlsx";
  }
}
