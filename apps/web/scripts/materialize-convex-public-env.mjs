import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendRoot = path.join(webRoot, "../../packages/backend");

function loadEnvFile(filePath) {
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

function loadEnvDir(dir, files) {
  for (const file of files) {
    loadEnvFile(path.join(dir, file));
  }
}

// The first file to set a key wins, so list them highest precedence first (as
// Next.js resolves them): a worktree's own `.env.local` beats the shared `.env`.
loadEnvDir(webRoot, [".env.development.local", ".env.local", ".env.development", ".env"]);
loadEnvDir(backendRoot, [".env.local", ".env"]);
loadEnvFile(path.join(webRoot, ".env.production.local"));

function readStatic(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function readConvexCloudUrlForBuild() {
  // `convex deploy --cmd` sets CONVEX_URL to the deployment that was just pushed.
  // Prefer it over NEXT_PUBLIC_CONVEX_URL, which may point at a different deployment.
  const fromDeploy = readStatic("CONVEX_URL", "CONVEX_CLOUD_URL");
  if (fromDeploy) return fromDeploy;
  return readStatic("NEXT_PUBLIC_CONVEX_URL");
}

const cloudUrl = readConvexCloudUrlForBuild();
if (!cloudUrl) {
  console.error(
    [
      "Convex URL missing at build time.",
      "Set NEXT_PUBLIC_CONVEX_URL in Vercel (Preview + Production),",
      "or build via `convex deploy --cmd` so CONVEX_URL is available.",
    ].join(" "),
  );
  process.exit(1);
}

const siteUrl =
  readStatic("NEXT_PUBLIC_CONVEX_SITE_URL", "CONVEX_SITE_URL") ??
  (cloudUrl.endsWith(".convex.cloud")
    ? cloudUrl.replace(/\.convex\.cloud$/, ".convex.site")
    : undefined);

const lines = [`NEXT_PUBLIC_CONVEX_URL=${cloudUrl}`];
if (siteUrl) {
  lines.push(`NEXT_PUBLIC_CONVEX_SITE_URL=${siteUrl}`);
}

const outputPath = path.join(webRoot, ".env.production.local");
// Never write through a symlink: an old worktree link points at the env store
// shared by every worktree, and this file holds this worktree's Convex URL.
try {
  if (fs.lstatSync(outputPath).isSymbolicLink()) fs.unlinkSync(outputPath);
} catch {
  // No file yet.
}
fs.writeFileSync(outputPath, `${lines.join("\n")}\n`);
console.log("Wrote apps/web/.env.production.local for Next.js build.");
