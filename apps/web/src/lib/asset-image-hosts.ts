/** Production R2 CDN — always allowlisted even when env vars are missing at Vercel build time. */
const DEFAULT_R2_ASSET_HOSTNAMES = ["assets.arbor.st"];

function hostnameFromUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).hostname;
  } catch {
    return undefined;
  }
}

/** Hostnames for public R2 assets used in next/image remotePatterns. */
export function collectR2ImageHostnames(): string[] {
  const hostnames = new Set<string>(DEFAULT_R2_ASSET_HOSTNAMES);

  const fromPublic = hostnameFromUrl(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL);
  if (fromPublic) hostnames.add(fromPublic);

  const fromConvex = hostnameFromUrl(process.env.R2_PUBLIC_BASE_URL);
  if (fromConvex) hostnames.add(fromConvex);

  const fromEndpoint = hostnameFromUrl(process.env.R2_ENDPOINT);
  if (fromEndpoint) hostnames.add(fromEndpoint);

  return [...hostnames];
}

/** True when Next.js image optimization is allowed to fetch from this hostname. */
export function isAllowedRemoteImageHostname(hostname: string): boolean {
  if (hostname.endsWith(".convex.cloud")) return true;

  if (collectR2ImageHostnames().includes(hostname)) return true;

  const immichHostname = hostnameFromUrl(process.env.NEXT_PUBLIC_IMMICH_URL);
  if (immichHostname && hostname === immichHostname) return true;

  return false;
}
