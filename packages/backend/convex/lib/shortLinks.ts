import { pacificDateKey } from "@arbor/format";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const SHORT_LINK_EVENT_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export type ShortLinkExpiryMode = Doc<"shortLinks">["expiryMode"];

export function validateShortLinkDestinationUrl(raw: string) {
  const url = raw.trim();
  if (!url) {
    throw new Error("Destination URL is required.");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Destination URL must be a valid URL.");
  }
  if (parsed.protocol === "javascript:" || parsed.protocol === "data:") {
    throw new Error("Destination URL is not allowed.");
  }
  if (parsed.protocol !== "https:" && !parsed.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
    throw new Error("Destination URL must use https://.");
  }
  return url;
}

/** Last millisecond of a Pacific calendar day from YYYY-MM-DD. */
export function endOfPacificDayMs(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) {
    throw new Error("Expiry date must use YYYY-MM-DD format.");
  }
  const startUtc = Date.UTC(year, month - 1, day - 1, 12, 0, 0);
  const endUtc = Date.UTC(year, month - 1, day + 2, 12, 0, 0);
  for (let ms = endUtc; ms >= startUtc; ms -= 60_000) {
    if (pacificDateKey(ms) === dateKey) {
      return ms;
    }
  }
  throw new Error("Could not resolve expiry date.");
}

export async function resolveShortLinkExpiresAt(
  ctx: MutationCtx,
  args: {
    expiryMode: ShortLinkExpiryMode;
    manualExpiresAtDate?: string;
    eventId?: Id<"events">;
  },
): Promise<number | undefined> {
  if (args.expiryMode === "none") {
    return undefined;
  }
  if (args.expiryMode === "manual") {
    if (!args.manualExpiresAtDate?.trim()) {
      throw new Error("Expiry date is required for custom expiry.");
    }
    return endOfPacificDayMs(args.manualExpiresAtDate.trim());
  }
  if (!args.eventId) {
    throw new Error("Linked event is required for event-based expiry.");
  }
  const event = await ctx.db.get(args.eventId);
  if (!event) {
    throw new Error("Linked event was not found.");
  }
  return event.endAt + SHORT_LINK_EVENT_GRACE_MS;
}

export function isShortLinkExpired(
  link: Pick<Doc<"shortLinks">, "enabled" | "expiresAt">,
  now = Date.now(),
) {
  if (!link.enabled) return true;
  if (link.expiresAt != null && link.expiresAt <= now) return true;
  return false;
}

export function shortLinkStatus(
  link: Pick<Doc<"shortLinks">, "enabled" | "expiresAt">,
  now = Date.now(),
): "active" | "disabled" | "expired" {
  if (link.expiresAt != null && link.expiresAt <= now) return "expired";
  if (!link.enabled) return "disabled";
  return "active";
}
