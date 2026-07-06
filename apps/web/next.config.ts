import fs from "fs";
import type { NextConfig } from "next";
import path from "path";
import { collectR2ImageHostnames } from "./src/lib/asset-image-hosts";

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
loadEnvFile(path.join(webDir, ".env.production.local"));

/** Convex CLI sets CONVEX_URL during `convex deploy --cmd`; prefer it at build time. */
const convexCloudUrl =
  process.env.CONVEX_URL?.trim() ||
  process.env.CONVEX_CLOUD_URL?.trim() ||
  process.env.NEXT_PUBLIC_CONVEX_URL?.trim() ||
  undefined;
const convexSiteUrl =
  process.env.NEXT_PUBLIC_CONVEX_SITE_URL?.trim() ||
  process.env.CONVEX_SITE_URL?.trim() ||
  (convexCloudUrl?.endsWith(".convex.cloud")
    ? convexCloudUrl.replace(/\.convex\.cloud$/, ".convex.site")
    : undefined);

const r2ImageHostnames = collectR2ImageHostnames();

const immichPublicBaseUrl = process.env.NEXT_PUBLIC_IMMICH_URL?.trim();
let immichImageHostname: string | undefined;
if (immichPublicBaseUrl) {
  try {
    immichImageHostname = new URL(immichPublicBaseUrl).hostname;
  } catch {
    immichImageHostname = undefined;
  }
}

let convexImageHostname: string | undefined;
if (convexCloudUrl) {
  try {
    convexImageHostname = new URL(convexCloudUrl).hostname;
  } catch {
    convexImageHostname = undefined;
  }
}

const imageRemotePatterns = [
  ...r2ImageHostnames.map((hostname) => ({
    protocol: "https" as const,
    hostname,
    pathname: "/**",
  })),
  ...(immichImageHostname
    ? [
        {
          protocol: "https" as const,
          hostname: immichImageHostname,
          pathname: "/**",
        },
      ]
    : []),
  ...(convexImageHostname
    ? [
        {
          protocol: "https" as const,
          hostname: convexImageHostname,
          pathname: "/api/storage/**",
        },
      ]
    : []),
  {
    protocol: "https" as const,
    hostname: "*.convex.cloud",
    pathname: "/api/storage/**",
  },
  {
    protocol: "https" as const,
    hostname: "**.convex.cloud",
    pathname: "/api/storage/**",
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ["backend", "@arbor/invoice-document"],
  turbopack: {
    root: repoRoot,
  },
  images: {
    remotePatterns: imageRemotePatterns,
    formats: ["image/avif", "image/webp"],
  },
  env: {
    ...(convexCloudUrl ? { NEXT_PUBLIC_CONVEX_URL: convexCloudUrl } : {}),
    ...(convexSiteUrl ? { NEXT_PUBLIC_CONVEX_SITE_URL: convexSiteUrl } : {}),
  },
};

export default nextConfig;
