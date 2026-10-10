#!/usr/bin/env node
/**
 * Regenerate src/mixing-station-data.ts from templates/mixing-station/*.json.
 *
 * Each template is the `data` of `POST /app/presets/scenes/create` from the
 * Mixing Station desktop REST API, taken in offline mode right after start
 * (X/M AIR → XR18, X32/M32), untouched. Refresh after a Mixing Station release
 * changes its scene format: `node ./scripts/embed-mixing-station.mjs`
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const load = (name) =>
  JSON.stringify(
    JSON.parse(readFileSync(join(root, `templates/mixing-station/${name}.json`), "utf8")),
  );
const out = join(root, "src/mixing-station-data.ts");
writeFileSync(
  out,
  [
    "// Auto-generated from templates/mixing-station — run scripts/embed-mixing-station.mjs to refresh.",
    'import type { MsSceneData } from "./mixing-station";',
    `export const MS_XR18 = ${load("xr18")} as unknown as MsSceneData;`,
    `export const MS_X32 = ${load("x32")} as unknown as MsSceneData;`,
    "",
  ].join("\n"),
);
console.log(`Wrote ${out}`);
