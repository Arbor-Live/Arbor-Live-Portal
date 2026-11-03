/**
 * Booking addresses: `alreq-…@`, `alinv-…@` and `alevt-<eventId>@` on the
 * inbound domain. Mail to one of them (To or CC) lands on that booking's
 * thread. Pure so the webhook, the read query and the tests share one parser.
 */

export const DEFAULT_INBOUND_EMAIL_DOMAIN = "arbor.st";

export function inboundEmailDomain() {
  return (process.env.INBOUND_EMAIL_DOMAIN?.trim() || DEFAULT_INBOUND_EMAIL_DOMAIN).toLowerCase();
}

const REQUEST_PREFIX = "alreq-";
const INVOICE_PREFIX = "alinv-";
const EVENT_PREFIX = "alevt-";

const SUFFIX_PATTERN = /^[a-z0-9]+$/;

/** `Name <a@b.com>`, `<a@b.com>` or `a@b.com` → `a@b.com` (lowercased), else null. */
export function extractEmailAddress(raw: string): string | null {
  const bracketed = raw.match(/<([^<>]+)>/);
  const candidate = (bracketed ? bracketed[1]! : raw).trim().toLowerCase();
  const at = candidate.lastIndexOf("@");
  if (at <= 0 || at === candidate.length - 1 || /\s/.test(candidate)) return null;
  return candidate;
}

const PLAIN_ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;

/** A bare `a@b.com` (lowercased), else null. Stricter than `extractEmailAddress`: no names, lists or brackets. */
export function normalizePlainAddress(raw: string): string | null {
  const candidate = raw.trim().toLowerCase();
  return PLAIN_ADDRESS.test(candidate) ? candidate : null;
}

/** The display name in `Name <a@b.com>` or `"Name" <a@b.com>`, if any. */
export function extractDisplayName(raw: string): string | undefined {
  const index = raw.indexOf("<");
  if (index <= 0) return undefined;
  const name = raw
    .slice(0, index)
    .trim()
    .replace(/^"(.*)"$/, "$1")
    .trim();
  return name || undefined;
}

export type BookingAddressRecord =
  | { kind: "request"; requestNumber?: string | null }
  | { kind: "invoice"; invoiceNumber: string }
  | { kind: "event"; id: string };

/** Null for a legacy request with no number. */
export function bookingAddressFor(record: BookingAddressRecord): string | null {
  let local: string;
  switch (record.kind) {
    case "request": {
      const number = record.requestNumber?.trim();
      if (!number) return null;
      local = number.toLowerCase();
      break;
    }
    case "invoice":
      local = record.invoiceNumber.trim().toLowerCase();
      break;
    case "event":
      local = `${EVENT_PREFIX}${record.id}`.toLowerCase();
      break;
  }
  return `${local}@${inboundEmailDomain()}`;
}

export type ParsedBookingAddress =
  | { kind: "request"; number: string }
  | { kind: "invoice"; number: string }
  | { kind: "event"; id: string };

/**
 * `number` is the stored (uppercase) form, ready for the `by_requestNumber` /
 * `by_invoiceNumber` indexes. `id` is a lowercase string; normalize it with
 * `ctx.db.normalizeId` before use.
 */
export function parseBookingAddress(address: string): ParsedBookingAddress | null {
  const email = extractEmailAddress(address);
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (email.slice(at + 1) !== inboundEmailDomain()) return null;
  const local = email.slice(0, at);

  for (const [prefix, kind] of [
    [REQUEST_PREFIX, "request"],
    [INVOICE_PREFIX, "invoice"],
  ] as const) {
    if (!local.startsWith(prefix)) continue;
    const suffix = local.slice(prefix.length);
    if (!SUFFIX_PATTERN.test(suffix)) return null;
    return { kind, number: local.toUpperCase() };
  }
  if (local.startsWith(EVENT_PREFIX)) {
    const id = local.slice(EVENT_PREFIX.length);
    return SUFFIX_PATTERN.test(id) ? { kind: "event", id } : null;
  }
  return null;
}
