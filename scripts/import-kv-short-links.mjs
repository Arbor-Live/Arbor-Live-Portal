#!/usr/bin/env node
/**
 * Import Cloudflare KV short-link entries into Convex.
 *
 * Usage:
 *   node scripts/import-kv-short-links.mjs path/to/kv-export.json
 *
 * KV export format (array):
 *   [{ "slug": "foo", "destinationUrl": "https://..." }, ...]
 *
 * Or wrangler bulk format:
 *   [{ "key": "foo", "value": "https://..." }, ...]
 *
 * Run from packages/backend:
 *   npx convex run internal.shortLinks.importFromKv -- '{"entries":[...]}'
 */
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/import-kv-short-links.mjs <kv-export.json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(path, "utf8"));
const rows = Array.isArray(raw) ? raw : raw.entries ?? [];

const entries = rows
  .map((row) => {
    const slug = row.slug ?? row.key;
    const destinationUrl = row.destinationUrl ?? row.value;
    if (!slug || !destinationUrl) return null;
    return {
      slug: String(slug),
      destinationUrl: String(destinationUrl),
      label: row.label ? String(row.label) : String(slug),
    };
  })
  .filter(Boolean);

console.log(JSON.stringify({ entries }, null, 2));
console.error(`Prepared ${entries.length} entries. Pipe to: npx convex run internal.shortLinks.importFromKv`);
