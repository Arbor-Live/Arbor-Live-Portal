/**
 * Search for the staff artist directory (`/dashboard/events/artists`). Staff
 * often start from a name or number in a band group chat, so a query matches
 * the act and every person on it, and phone numbers match on digits alone
 * ("650-555-0101", "(650) 555 0101" and "+16505550101" are the same number).
 */

export type ArtistDirectoryPerson = {
  name: string;
  email: string;
  phone: string;
  /** Free-text role in the act ("Guitar", "Manager"). */
  role: string;
  source: "contact" | "member" | "payee" | "listed";
};

export type ArtistDirectoryEntry = {
  name: string;
  oneLiner: string;
  genres: string[];
  mainContactName: string;
  mainContactEmail: string;
  mainContactPhone: string;
  payeeName: string;
  payeeEmail: string;
  members: Array<{ name: string; email: string; phone: string; bandRole: string }>;
  bandMembers: string[];
};

/** Fewer digits than this is a house number or a year, not a phone search. */
const MIN_PHONE_DIGITS = 4;

const PHONE_QUERY = /^[\d\s().+-]+$/;

export function phoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  // Drop the US country code so "+1 650…" matches "650…".
  return digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
}

/** Everyone reachable for an act, the main contact first. People without a name are skipped. */
export function artistDirectoryPeople(entry: ArtistDirectoryEntry): ArtistDirectoryPerson[] {
  const people: ArtistDirectoryPerson[] = [];
  if (entry.mainContactName || entry.mainContactEmail || entry.mainContactPhone) {
    people.push({
      name: entry.mainContactName,
      email: entry.mainContactEmail,
      phone: entry.mainContactPhone,
      role: "Main contact",
      source: "contact",
    });
  }
  for (const member of entry.members) {
    people.push({ name: member.name, email: member.email, phone: member.phone, role: member.bandRole, source: "member" });
  }
  if (entry.payeeName || entry.payeeEmail) {
    people.push({ name: entry.payeeName, email: entry.payeeEmail, phone: "", role: "Payee", source: "payee" });
  }
  for (const name of entry.bandMembers) {
    if (name.trim()) people.push({ name: name.trim(), email: "", phone: "", role: "", source: "listed" });
  }
  return people;
}

function personMatches(person: ArtistDirectoryPerson, text: string, digits: string) {
  if (digits && phoneDigits(person.phone).includes(digits)) return true;
  return [person.name, person.email, person.role].join(" ").toLowerCase().includes(text);
}

/**
 * Whether an act matches the search, and the first person who matched (so a
 * row can say "Matched Jane Doe · Guitar"). `person` is null when the act
 * itself matched by name, blurb or genre. Returns null when nothing matched.
 */
export function matchArtistDirectoryEntry(
  entry: ArtistDirectoryEntry,
  query: string,
): { person: ArtistDirectoryPerson | null } | null {
  const text = query.trim().toLowerCase();
  if (!text) return { person: null };
  // Only a query made of phone characters is a phone search: "band 2024" is text.
  const queryDigits = PHONE_QUERY.test(text) ? phoneDigits(text) : "";
  const digits = queryDigits.length >= MIN_PHONE_DIGITS ? queryDigits : "";
  if ([entry.name, entry.oneLiner, ...entry.genres].join(" ").toLowerCase().includes(text)) {
    return { person: null };
  }
  const person = artistDirectoryPeople(entry).find((candidate) => personMatches(candidate, text, digits));
  return person ? { person } : null;
}
