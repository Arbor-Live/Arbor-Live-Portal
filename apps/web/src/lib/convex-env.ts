function readFirstEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

export function getConvexCloudUrl(): string {
  const url = readFirstEnv("NEXT_PUBLIC_CONVEX_URL", "CONVEX_URL", "CONVEX_CLOUD_URL");
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set. Set it in Vercel or run `npx convex dev` locally.",
    );
  }
  return url;
}

export function getConvexSiteUrl(): string {
  const explicit = readFirstEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "CONVEX_SITE_URL");
  if (explicit) {
    if (explicit.endsWith(".convex.cloud")) {
      throw new Error(
        "NEXT_PUBLIC_CONVEX_SITE_URL must end in .convex.site, not .convex.cloud.",
      );
    }
    return explicit;
  }

  const cloudUrl = readFirstEnv("NEXT_PUBLIC_CONVEX_URL", "CONVEX_URL", "CONVEX_CLOUD_URL");
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
      // Fall through to the error below.
    }
  }

  throw new Error(
    "NEXT_PUBLIC_CONVEX_SITE_URL is not set and could not be derived from the Convex cloud URL.",
  );
}
