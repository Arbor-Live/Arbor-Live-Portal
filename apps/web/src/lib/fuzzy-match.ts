/**
 * Lightweight fuzzy match score for searchable selects.
 * Higher is better. Returns 0 when there is no match.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const t = text.toLowerCase();
  if (!t) return 0;

  if (t === q) return 1000;
  if (t.startsWith(q)) return 800 + Math.min(q.length, 50);
  if (t.includes(q)) return 600 + Math.min(q.length, 50);

  // Token match: all query tokens appear somewhere
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((token) => t.includes(token))) {
    return 500 + tokens.length * 10;
  }

  // Subsequence match (characters in order)
  let ti = 0;
  let matched = 0;
  let consecutive = 0;
  let bestConsecutive = 0;
  for (let qi = 0; qi < q.length; qi += 1) {
    const ch = q[qi]!;
    let found = false;
    while (ti < t.length) {
      if (t[ti] === ch) {
        found = true;
        matched += 1;
        consecutive += 1;
        bestConsecutive = Math.max(bestConsecutive, consecutive);
        ti += 1;
        break;
      }
      consecutive = 0;
      ti += 1;
    }
    if (!found) return 0;
  }

  return 100 + matched * 2 + bestConsecutive * 5;
}

export function fuzzyScoreHaystack(query: string, parts: Array<string | undefined | null>): number {
  let best = 0;
  for (const part of parts) {
    if (!part) continue;
    best = Math.max(best, fuzzyScore(query, part));
  }
  return best;
}
