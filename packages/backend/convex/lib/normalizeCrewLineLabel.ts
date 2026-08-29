/**
 * Older crew labels used role fallback = person name, producing
 * `Alex (Alex (Lead))`. Collapse that redundancy for display and storage.
 */
export function normalizeCrewLineLabel(label: string): string {
  return label
    .replace(/^((?:.* — )?)(.+?) \(\2 \(Lead\)\)$/, "$1$2 (Lead)")
    .replace(/^((?:.* — )?)(.+?) \(\2\)$/, "$1$2");
}
