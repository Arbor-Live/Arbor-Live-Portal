import { fetchAuthAction, fetchAuthMutation, isAuthenticated } from "@/lib/auth-server";
import { api } from "@/lib/convex-api";
import { getImmichServerConfig, inferImmichAssetType } from "@/lib/immich-server";

async function addAssetToAlbum(baseUrl: string, apiKey: string, immichAlbumId: string, assetId: string) {
  const response = await fetch(`${baseUrl}/albums/${immichAlbumId}/assets`, {
    method: "PUT",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ ids: [assetId] }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || response.statusText);
  }
}

export async function POST(request: Request) {
  if (!(await isAuthenticated())) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const targetType = formData.get("targetType");
    const targetId = formData.get("targetId");

    if (!(file instanceof File)) {
      return new Response("File is required.", { status: 400 });
    }
    if (targetType !== "band" && targetType !== "event") {
      return new Response("Invalid target type.", { status: 400 });
    }
    if (typeof targetId !== "string" || !targetId.trim()) {
      return new Response("Target id is required.", { status: 400 });
    }

    const trimmedTargetId = targetId.trim();
    let album = await fetchAuthAction(api.immichEnsure.ensureUploadAlbum, {
      targetType,
      targetId: trimmedTargetId,
    });

    if (!album) {
      return new Response("Could not resolve upload album.", { status: 400 });
    }

    const { baseUrl, apiKey } = getImmichServerConfig();
    const uploadForm = new FormData();
    uploadForm.append("assetData", file, file.name);

    const uploadResponse = await fetch(`${baseUrl}/assets`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
      body: uploadForm,
    });

    if (!uploadResponse.ok) {
      const body = await uploadResponse.text().catch(() => "");
      return new Response(body || uploadResponse.statusText, { status: uploadResponse.status });
    }

    const uploaded = (await uploadResponse.json()) as { id?: string };
    const assetId = uploaded.id;
    if (!assetId) {
      return new Response("Immich did not return an asset id.", { status: 502 });
    }

    try {
      await addAssetToAlbum(baseUrl, apiKey, album.immichAlbumId, assetId);
    } catch {
      album = await fetchAuthAction(api.immichEnsure.ensureUploadAlbum, {
        targetType,
        targetId: trimmedTargetId,
      });
      if (!album) {
        return new Response("Could not recreate upload album.", { status: 502 });
      }
      await addAssetToAlbum(baseUrl, apiKey, album.immichAlbumId, assetId);
    }

    const assetType = inferImmichAssetType(file.name, file.type || "application/octet-stream");
    await fetchAuthMutation(api.immich.recordUploadedAsset, {
      albumLinkId: album.albumLinkId,
      immichAssetId: assetId,
      originalFileName: file.name,
      type: assetType,
    });

    return Response.json({
      immichAssetId: assetId,
      originalFileName: file.name,
      type: assetType,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    return new Response(message, { status: 500 });
  }
}
