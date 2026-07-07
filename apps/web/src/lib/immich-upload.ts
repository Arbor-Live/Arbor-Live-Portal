export function inferImmichAssetType(fileName: string, mimeType: string): "IMAGE" | "VIDEO" {
  if (mimeType.startsWith("video/")) return "VIDEO";
  if (mimeType.startsWith("image/")) return "IMAGE";
  const lower = fileName.toLowerCase();
  if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(lower)) return "VIDEO";
  return "IMAGE";
}

export type ImmichUploadConfig = {
  uploadUrl: string;
  shareKey: string;
};

export type ImmichUploadProgress = {
  loaded: number;
  total: number;
};

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

function buildUploadFormData(file: File) {
  const modifiedAt = new Date(file.lastModified || Date.now());
  const formData = new FormData();
  formData.append("assetData", file, file.name);
  formData.append("fileCreatedAt", modifiedAt.toISOString());
  formData.append("fileModifiedAt", modifiedAt.toISOString());
  return formData;
}

export async function uploadFileToImmichShare(
  file: File,
  config: ImmichUploadConfig,
  onProgress?: (progress: ImmichUploadProgress) => void,
) {
  const url = `${config.uploadUrl}?key=${encodeURIComponent(config.shareKey)}`;
  const formData = buildUploadFormData(file);

  return await new Promise<{
    immichAssetId: string;
    originalFileName: string;
    type: "IMAGE" | "VIDEO";
  }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.responseType = "text";

    xhr.upload.addEventListener("progress", (event) => {
      onProgress?.({
        loaded: event.loaded,
        total: event.lengthComputable ? event.total : file.size,
      });
    });

    xhr.addEventListener("load", () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error(formatImmichUploadError(xhr.responseText || "Upload failed.")));
        return;
      }

      try {
        const uploaded = JSON.parse(xhr.responseText) as { id?: string; assetId?: string };
        const assetId = uploaded.id ?? uploaded.assetId;
        if (!assetId) {
          reject(new Error("Immich did not return an asset id."));
          return;
        }
        resolve({
          immichAssetId: assetId,
          originalFileName: file.name,
          type: inferImmichAssetType(file.name, file.type || "application/octet-stream"),
        });
      } catch {
        reject(new Error("Immich returned an invalid upload response."));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload failed due to a network error.")));
    xhr.addEventListener("abort", () => reject(new Error("Upload was cancelled.")));
    xhr.send(formData);
  });
}
