export function inferImmichAssetType(fileName: string, mimeType: string): "IMAGE" | "VIDEO" {
  if (mimeType.startsWith("video/")) return "VIDEO";
  if (mimeType.startsWith("image/")) return "IMAGE";
  const lower = fileName.toLowerCase();
  if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(lower)) return "VIDEO";
  return "IMAGE";
}

type UploadConfig = {
  uploadUrl: string;
  shareKey: string;
};

const PORTAL_DEVICE_ID = "arbor-live-portal";

function createDeviceAssetId(file: File) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${file.name}-${file.size}-${file.lastModified}-${Date.now()}`;
}

function formatImmichUploadError(message: string) {
  try {
    const parsed = JSON.parse(message) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === "string").join(", ");
    }
    if (typeof parsed === "object" && parsed !== null && "message" in parsed) {
      const value = (parsed as { message?: unknown }).message;
      if (typeof value === "string") return value;
      if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === "string").join(", ");
      }
    }
  } catch {
    // Keep the raw response text.
  }
  return message || "Upload failed.";
}

export async function uploadFileToImmichShare(file: File, config: UploadConfig) {
  const modifiedAt = new Date(file.lastModified || Date.now());
  const formData = new FormData();
  formData.append("assetData", file, file.name);
  formData.append("deviceId", PORTAL_DEVICE_ID);
  formData.append("deviceAssetId", createDeviceAssetId(file));
  formData.append("fileCreatedAt", modifiedAt.toISOString());
  formData.append("fileModifiedAt", modifiedAt.toISOString());

  const response = await fetch(
    `${config.uploadUrl}?key=${encodeURIComponent(config.shareKey)}`,
    {
      method: "POST",
      body: formData,
    },
  );

  if (!response.ok) {
    const message = await response.text().catch(() => "Upload failed.");
    throw new Error(formatImmichUploadError(message));
  }

  const uploaded = (await response.json()) as { id?: string; assetId?: string };
  const assetId = uploaded.id ?? uploaded.assetId;
  if (!assetId) {
    throw new Error("Immich did not return an asset id.");
  }

  return {
    immichAssetId: assetId,
    originalFileName: file.name,
    type: inferImmichAssetType(file.name, file.type || "application/octet-stream"),
  };
}
