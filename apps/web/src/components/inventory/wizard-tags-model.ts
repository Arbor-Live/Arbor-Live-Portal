import { classifyLabelScan, normalizeAssetScanInput } from "@/lib/asset-scan";

/** One asset being created in the create-asset wizard. */
export type WizardTag = {
  localId: string;
  assetId: string;
  serialNumber: string;
  storageLocationId: string;
  containedInAssetId: string;
  status: string;
  notes: string;
  contains: string[];
};

export function emptyTag(from?: Pick<WizardTag, "storageLocationId" | "containedInAssetId">): WizardTag {
  return {
    localId: crypto.randomUUID(),
    assetId: "",
    serialNumber: "",
    storageLocationId: from?.storageLocationId ?? "",
    containedInAssetId: from?.containedInAssetId ?? "",
    status: "",
    notes: "",
    contains: [],
  };
}

/**
 * Folds one bulk camera read into the batch, mirroring the keyboard flow
 * (Asset ID → Serial → next asset): the read fills its field on the last
 * asset, or starts a new asset when that field is already taken.
 */
export function applyLabelScan(
  tags: WizardTag[],
  raw: string,
  existingAssetIds: Set<string>,
): { tags: WizardTag[] } | { error: string } {
  const field = classifyLabelScan(raw);
  const value = field === "assetId" ? normalizeAssetScanInput(raw) : raw.trim();
  if (!value) return { error: `Couldn’t read an asset ID from “${raw.trim()}”. Try a tag like ALE-0123.` };
  const key = value.toLowerCase();
  const current = (tag: WizardTag) =>
    field === "assetId" ? (normalizeAssetScanInput(tag.assetId) ?? tag.assetId.trim()) : tag.serialNumber.trim();
  if (tags.some((tag) => current(tag).toLowerCase() === key)) {
    return { error: `${field === "assetId" ? "Asset ID" : "Serial"} ${value} is already in this batch.` };
  }
  if (field === "assetId" && existingAssetIds.has(key)) {
    return { error: `Asset ID already exists: ${value}` };
  }
  const last = tags[tags.length - 1]!;
  if (!current(last)) {
    return { tags: tags.map((tag) => (tag === last ? { ...tag, [field]: value } : tag)) };
  }
  return { tags: [...tags, { ...emptyTag(last), [field]: value }] };
}
