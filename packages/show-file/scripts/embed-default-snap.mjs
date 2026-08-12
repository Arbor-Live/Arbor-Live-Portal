#!/usr/bin/env node
/**
 * Regenerate src/default-snap-data.ts from templates/Default.snap.
 * Run after replacing the Wing template: `node scripts/embed-default-snap.mjs`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "templates/Default.snap"), "utf8");
const parsed = JSON.parse(raw);
const out = join(root, "src/default-snap-data.ts");
writeFileSync(
  out,
  [
    "// Auto-generated from templates/Default.snap — run scripts/embed-default-snap.mjs to refresh.",
    'import type { WingSnap } from "./types";',
    `const DEFAULT_SNAP = ${JSON.stringify(parsed)} as unknown as WingSnap;`,
    "export default DEFAULT_SNAP;",
    "",
  ].join("\n"),
);
console.log(`Wrote ${out}`);
