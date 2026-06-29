import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

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
