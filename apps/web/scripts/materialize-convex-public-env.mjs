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

// Match next.config.ts so local/worktree env files (including arbor-env symlinks) work.
loadEnvDir(webRoot, [".env", ".env.local", ".env.development", ".env.development.local"]);
loadEnvDir(backendRoot, [".env", ".env.local"]);
loadEnvFile(path.join(webRoot, ".env.production.local"));

function readStatic(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

const cloudUrl = readStatic("NEXT_PUBLIC_CONVEX_URL", "CONVEX_URL", "CONVEX_CLOUD_URL");
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

fs.writeFileSync(path.join(webRoot, ".env.production.local"), `${lines.join("\n")}\n`);
console.log("Wrote apps/web/.env.production.local for Next.js build.");
