function trimEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Next.js only inlines `process.env.NEXT_PUBLIC_*` for static property access.
 * Do not read these through dynamic keys (`process.env[key]`).
 */
function readConvexCloudUrl(): string | undefined {
  return (
    trimEnv(process.env.NEXT_PUBLIC_CONVEX_URL) ??
    trimEnv(process.env.CONVEX_URL) ??
    trimEnv(process.env.CONVEX_CLOUD_URL)
  );
}

function readConvexSiteUrl(cloudUrl: string | undefined): string | undefined {
  const explicit =
    trimEnv(process.env.NEXT_PUBLIC_CONVEX_SITE_URL) ?? trimEnv(process.env.CONVEX_SITE_URL);
  if (explicit) return explicit;
  if (cloudUrl?.endsWith(".convex.cloud")) {
    return cloudUrl.replace(/\.convex\.cloud$/, ".convex.site");
  }
  if (cloudUrl) {
    try {
      const parsed = new URL(cloudUrl);
      if (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") {
        const port = Number(parsed.port);
        if (Number.isFinite(port) && port > 0) {
          parsed.port = String(port + 1);
          return parsed.toString().replace(/\/$/, "");
        }
      }
    } catch {
      // Fall through.
    }
  }
  return undefined;
}

export function getConvexCloudUrl(): string {
  const url = readConvexCloudUrl();
  if (!url) {
    throw new Error(
      "Convex URL is not configured. Set NEXT_PUBLIC_CONVEX_URL in Vercel (Preview + Production), or run `npx convex dev` locally.",
    );
  }
  return url;
}

export function getConvexSiteUrl(): string {
  const cloudUrl = readConvexCloudUrl();
  const siteUrl = readConvexSiteUrl(cloudUrl);
  if (siteUrl) {
    if (siteUrl.endsWith(".convex.cloud")) {
      throw new Error(
        "NEXT_PUBLIC_CONVEX_SITE_URL must end in .convex.site, not .convex.cloud.",
      );
    }
    return siteUrl;
  }

  throw new Error(
    "NEXT_PUBLIC_CONVEX_SITE_URL is not set and could not be derived from the Convex cloud URL.",
  );
}
