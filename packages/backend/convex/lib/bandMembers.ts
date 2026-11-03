/**
 * A band's member names with blanks and repeats dropped. The contact is often
 * also listed as a member, and a repeat inflates the band's headcount (which
 * pre-fills per-person pay).
 */
export function uniqueBandMemberNames(names: Array<string | undefined>) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of names) {
    const name = raw?.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique;
}
