import { fetchAuthMutation, fetchAuthQuery } from "@/lib/auth-server";
import { api } from "@/lib/convex-api";
import { getImmichServerConfig, inferImmichAssetType } from "@/lib/immich-server";

type AssetRouteKind = "thumbnail" | "original" | "playback";

function immichAssetPath(assetId: string, kind: AssetRouteKind, searchParams?: URLSearchParams) {
  const { baseUrl } = getImmichServerConfig();
  const suffix =
    kind === "thumbnail"
      ? `thumbnail${searchParams?.toString() ? `?${searchParams}` : "?size=preview"}`
      : kind === "playback"
        ? "video/playback"
        : "original";
  return `${baseUrl}/assets/${assetId}/${suffix}`;
}

async function proxyImmichAsset(assetId: string, kind: AssetRouteKind, request: Request) {
  const allowed = await fetchAuthQuery(api.immich.verifyAssetAccess, { immichAssetId: assetId });
  if (!allowed) {
    return new Response("Forbidden", { status: 403 });
  }

  const { apiKey } = getImmichServerConfig();
  const incomingUrl = new URL(request.url);
  const search = kind === "thumbnail" ? incomingUrl.searchParams : undefined;
  const upstream = await fetch(immichAssetPath(assetId, kind, search), {
    headers: {
      "x-api-key": apiKey,
      Accept: "*/*",
    },
  });

  if (!upstream.ok) {
    const body = await upstream.text().catch(() => "");
    return new Response(body || upstream.statusText, { status: upstream.status });
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  const contentLength = upstream.headers.get("content-length");
  if (contentType) headers.set("content-type", contentType);
  if (contentLength) headers.set("content-length", contentLength);
  headers.set("cache-control", "private, max-age=3600");

  return new Response(upstream.body, { status: upstream.status, headers });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ assetId: string; kind: string }> },
) {
  const { assetId, kind } = await context.params;
  if (!assetId) return new Response("Asset id required.", { status: 400 });
  if (kind !== "thumbnail" && kind !== "original" && kind !== "playback") {
    return new Response("Unsupported asset route.", { status: 404 });
  }
  try {
    return await proxyImmichAsset(assetId, kind, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Immich proxy failed.";
    return new Response(message, { status: 500 });
  }
}
