import { fileURLToPath } from "node:url";
import type { WingSnap } from "./types";
import DEFAULT_SNAP from "./default-snap-data";

let cached: WingSnap | null = null;

/**
 * Deep-clone Arbor’s Wing Default.snap template.
 * Embedded in the package so Convex `"use node"` actions can load it after bundling.
 */
export function loadDefaultTemplate(): WingSnap {
  if (!cached) {
    cached = DEFAULT_SNAP;
  }
  return structuredClone(cached);
}

/** On-disk JSON path for tooling/tests that want the raw Wing file. */
export function resolveTemplatePath(): string {
  return fileURLToPath(new URL("../templates/Default.snap", import.meta.url));
}
