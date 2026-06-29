import fs from "fs";
import type { NextConfig } from "next";
import path from "path";

const webDir = __dirname;
const repoRoot = path.join(webDir, "../..");
const backendDir = path.join(repoRoot, "packages/backend");

function loadEnvFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function loadEnvDir(dir: string, files: string[]) {
  for (const file of files) {
    loadEnvFile(path.join(dir, file));
  }
}

// Turbopack root is the monorepo; load env from the web app and Convex backend.
loadEnvDir(webDir, [".env", ".env.local", ".env.development", ".env.development.local"]);
loadEnvDir(backendDir, [".env", ".env.local"]);

function readEnv(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

/** Convex CLI sets CONVEX_URL during `convex deploy --cmd`; expose it to the Next.js bundle. */
const convexCloudUrl = readEnv("NEXT_PUBLIC_CONVEX_URL", "CONVEX_URL", "CONVEX_CLOUD_URL");
const convexSiteUrl =
  readEnv("NEXT_PUBLIC_CONVEX_SITE_URL", "CONVEX_SITE_URL") ??
  (convexCloudUrl?.endsWith(".convex.cloud")
    ? convexCloudUrl.replace(/\.convex\.cloud$/, ".convex.site")
    : undefined);

const nextConfig: NextConfig = {
  transpilePackages: ["backend", "@arbor/invoice-document"],
  turbopack: {
    root: repoRoot,
  },
  env: {
    ...(convexCloudUrl ? { NEXT_PUBLIC_CONVEX_URL: convexCloudUrl } : {}),
    ...(convexSiteUrl ? { NEXT_PUBLIC_CONVEX_SITE_URL: convexSiteUrl } : {}),
  },
};

export default nextConfig;
