import { v } from "convex/values";
import { extractDisplayName, extractEmailAddress } from "./emailAddresses";

export const MAX_REFERENCES = 50;
export const MAX_ATTACHMENTS = 20;
/** Reply text shown in the UI; a person's reply is far shorter than this. */
export const MAX_BODY_CHARS = 20_000;
/** Whole plain-text message kept for reference. */
export const MAX_FULL_TEXT_CHARS = 100_000;

export const parsedInboundEmailValue = v.object({
  resendEmailId: v.string(),
  messageId: v.optional(v.string()),
  inReplyTo: v.optional(v.string()),
  references: v.array(v.string()),
  fromEmail: v.string(),
  fromName: v.optional(v.string()),
  to: v.array(v.string()),
  cc: v.array(v.string()),
  /** Envelope recipients, which include BCC'd booking addresses. */
  receivedFor: v.array(v.string()),
  subject: v.string(),
  /** Full plain text; the quoted history is stripped when it is stored. */
  text: v.string(),
  attachments: v.array(
    v.object({
      filename: v.string(),
      contentType: v.optional(v.string()),
      size: v.optional(v.number()),
    }),
  ),
  receivedAt: v.number(),
});

export type ParsedInboundEmail = {
  resendEmailId: string;
  messageId?: string;
  inReplyTo?: string;
  references: string[];
  fromEmail: string;
  fromName?: string;
  to: string[];
  cc: string[];
  receivedFor: string[];
  subject: string;
  text: string;
  attachments: { filename: string; contentType?: string; size?: number }[];
  receivedAt: number;
};

/** `<abc@host>` → `abc@host`. */
export function normalizeMessageId(raw: string): string | undefined {
  const bracketed = raw.match(/<([^<>]+)>/);
  const id = (bracketed ? bracketed[1]! : raw).trim();
  return id || undefined;
}

function parseMessageIdList(raw: string): string[] {
  const bracketed = [...raw.matchAll(/<([^<>\s]+)>/g)].map((m) => m[1]!);
  const ids = bracketed.length > 0 ? bracketed : raw.split(/\s+/).filter(Boolean);
  return ids.flatMap((id) => normalizeMessageId(id) ?? []);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** HTML is only a fallback for a missing text part; parse no more than this. */
export const MAX_HTML_CHARS = 200_000;

const SPECIAL_OPEN = /<(script|style|head)\b/gi;

/**
 * Drops `<script>`, `<style>` and `<head>` blocks in one forward pass. A lazy
 * regex rescans the rest of the input for every unclosed opening tag, which
 * untrusted mail can turn quadratic. Once a closing tag is known to be absent,
 * later openings of that name only lose their own tag, so an HTML email that
 * omits `</head>` keeps its body.
 */
function stripSpecialTagBlocks(html: string): string {
  const lower = html.toLowerCase();
  const missingClose = new Set<string>();
  const parts: string[] = [];
  let cursor = 0;
  SPECIAL_OPEN.lastIndex = 0;
  for (let match = SPECIAL_OPEN.exec(html); match; match = SPECIAL_OPEN.exec(html)) {
    if (match.index < cursor) continue;
    const name = match[1]!.toLowerCase();
    parts.push(html.slice(cursor, match.index));
    const close = missingClose.has(name) ? -1 : lower.indexOf(`</${name}`, match.index);
    if (close === -1) {
      missingClose.add(name);
      const tagEnd = html.indexOf(">", match.index);
      cursor = tagEnd === -1 ? html.length : tagEnd + 1;
    } else {
      const closeEnd = html.indexOf(">", close);
      cursor = closeEnd === -1 ? html.length : closeEnd + 1;
    }
    SPECIAL_OPEN.lastIndex = cursor;
  }
  parts.push(html.slice(cursor));
  return parts.join("");
}

/** Plain text from HTML for the rare message that arrives without a text part. */
export function htmlToText(html: string): string {
  return stripSpecialTagBlocks(html.slice(0, MAX_HTML_CHARS))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^<>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#")) {
        const code =
          entity[1]!.toLowerCase() === "x"
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function addressList(value: unknown): string[] {
  return stringList(value).map((raw) => extractEmailAddress(raw) ?? raw.trim().toLowerCase());
}

function headerValue(headers: Record<string, unknown>, name: string): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name && typeof value === "string") return value;
  }
  return undefined;
}

/**
 * The `GET /emails/receiving/{id}` body, narrowed field by field. Throws a
 * message naming what was missing so a changed API shows up in the logs.
 */
export function parseReceivedEmail(raw: unknown, resendEmailId: string): ParsedInboundEmail {
  if (!isRecord(raw)) throw new Error("Resend receiving email: expected an object");
  const from = optionalString(raw.from);
  if (!from) throw new Error("Resend receiving email: missing `from`");

  const headers = isRecord(raw.headers) ? raw.headers : {};
  const messageId =
    normalizeMessageId(optionalString(raw.message_id) ?? "") ??
    normalizeMessageId(headerValue(headers, "message-id") ?? "");
  const inReplyTo = parseMessageIdList(headerValue(headers, "in-reply-to") ?? "")[0];
  // Oldest first, so the cap keeps the ids nearest this message.
  const references = parseMessageIdList(headerValue(headers, "references") ?? "").slice(
    -MAX_REFERENCES,
  );

  // Capped here, not only when stored: the whole text is a mutation argument.
  const text = (
    optionalString(raw.text) ?? (typeof raw.html === "string" ? htmlToText(raw.html) : "")
  ).slice(0, MAX_FULL_TEXT_CHARS);

  const attachments = (Array.isArray(raw.attachments) ? raw.attachments : [])
    .filter(isRecord)
    .slice(0, MAX_ATTACHMENTS)
    .map((attachment) => ({
      filename: optionalString(attachment.filename) ?? "attachment",
      contentType: optionalString(attachment.content_type),
      size: typeof attachment.size === "number" ? attachment.size : undefined,
    }));

  const createdAt = typeof raw.created_at === "string" ? Date.parse(raw.created_at) : Number.NaN;

  return {
    resendEmailId,
    messageId,
    inReplyTo,
    references,
    fromEmail: extractEmailAddress(from) ?? from.trim().toLowerCase(),
    fromName: extractDisplayName(from),
    to: addressList(raw.to),
    cc: addressList(raw.cc),
    receivedFor: addressList(raw.received_for),
    subject: typeof raw.subject === "string" ? raw.subject : "",
    text,
    attachments,
    receivedAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
  };
}
