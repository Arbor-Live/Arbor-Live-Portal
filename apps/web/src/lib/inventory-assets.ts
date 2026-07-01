export const INVENTORY_R2_ASSET_PREFIX = "r2:";

export function formatStoredInventoryAsset(key: string): string {
  return `${INVENTORY_R2_ASSET_PREFIX}${key}`;
}

export function isImageAssetReference(value: string | undefined): boolean {
  const trimmed = value?.trim();
  if (!trimmed) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    return /\.(png|jpe?g|webp|gif|svg)(\?.*)?$/i.test(trimmed);
  }
  const key = trimmed.startsWith(INVENTORY_R2_ASSET_PREFIX)
    ? trimmed.slice(INVENTORY_R2_ASSET_PREFIX.length)
    : trimmed;
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(key);
}
