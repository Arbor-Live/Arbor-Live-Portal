import { pacificDateKey } from "@arbor/format";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { appError } from "./errors";

export const SHORT_LINK_EVENT_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export type ShortLinkExpiryMode = Doc<"shortLinks">["expiryMode"];

export function validateShortLinkDestinationUrl(raw: string) {
  const url = raw.trim();
  if (!url) {
    appError("SHORT_LINK_DESTINATION_REQUIRED", "Destination URL is required.");
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    appError("SHORT_LINK_DESTINATION_INVALID", "Destination URL must be a valid URL.");
  }
  if (parsed.protocol === "javascript:" || parsed.protocol === "data:") {
    appError("SHORT_LINK_DESTINATION_BLOCKED", "Destination URL is not allowed.");
  }
  if (parsed.protocol !== "https:" && !parsed.hostname.match(/^(localhost|127\.0\.0\.1)$/)) {
    appError("SHORT_LINK_DESTINATION_HTTPS_REQUIRED", "Destination URL must use https://.");
  }
  return url;
}

/** Last millisecond of a Pacific calendar day from YYYY-MM-DD. */
export function endOfPacificDayMs(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) {
    appError("SHORT_LINK_EXPIRY_DATE_FORMAT", "Expiry date must use YYYY-MM-DD format.");
  }
  const startUtc = Date.UTC(year, month - 1, day - 1, 12, 0, 0);
  const endUtc = Date.UTC(year, month - 1, day + 2, 12, 0, 0);
  for (let ms = endUtc; ms >= startUtc; ms -= 60_000) {
    if (pacificDateKey(ms) === dateKey) {
      return ms;
    }
  }
  appError("SHORT_LINK_EXPIRY_DATE_UNRESOLVED", "Could not resolve expiry date.");
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
      appError("SHORT_LINK_EXPIRY_DATE_REQUIRED", "Expiry date is required for custom expiry.");
    }
    return endOfPacificDayMs(args.manualExpiresAtDate.trim());
  }
  if (!args.eventId) {
    appError("SHORT_LINK_EVENT_REQUIRED", "Linked event is required for event-based expiry.");
  }
  const event = await ctx.db.get(args.eventId);
  if (!event) {
    appError("SHORT_LINK_EVENT_NOT_FOUND", "Linked event was not found.");
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
