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

type SpecialTag = "script" | "style" | "head" | "title";

/**
 * Where each block ends. A closing tag missing its `>` still counts, and then
 * only the tag name is consumed. `lastIndex` must be set before every `exec`. A head
 * also ends where the body starts, since `</head>` is optional and a later one
 * may belong to quoted HTML.
 */
const BLOCK_END: Record<SpecialTag, RegExp> = {
  script: /<\/script(?=[\s/>])(?:[^<>]*>)?/gi,
  style: /<\/style(?=[\s/>])(?:[^<>]*>)?/gi,
  title: /<\/title(?=[\s/>])(?:[^<>]*>)?/gi,
  head: /<\/head(?=[\s/>])(?:[^<>]*>)?|<(?:body|div|p|table|blockquote|h[1-6]|ul|ol|tr)(?=[\s/>])/gi,
};

/**
 * Removes `<!-- … -->` comments, including Outlook's `<!--[if mso]> … <![endif]-->`
 * blocks: mail clients never show them, so a tag inside one must not decide
 * what text is kept. An unterminated `<!--` is left alone rather than eating
 * the rest of the message.
 */
function stripComments(html: string): string {
  const parts: string[] = [];
  let cursor = 0;
  for (let start = html.indexOf("<!--"); start !== -1; start = html.indexOf("<!--", cursor)) {
    const end = html.indexOf("-->", start + 4);
    if (end === -1) break;
    parts.push(html.slice(cursor, start));
    cursor = end + 3;
  }
  parts.push(html.slice(cursor));
  return parts.join("");
}

/**
 * The rest of an opening tag: a `>` within 1000 chars and before any `<`.
 * Further than that reads as prose, and the bound keeps each probe O(1).
 */
const OPENING_TAG_REST = /[^<>]{0,1000}>/y;

/** End of the opening tag at `start`, or null when it has no `>`. */
function openingTagEnd(html: string, start: number): number | null {
  OPENING_TAG_REST.lastIndex = start + 1;
  const rest = OPENING_TAG_REST.exec(html);
  return rest ? start + 1 + rest[0].length : null;
}

/**
 * Drops `<script>`, `<style>`, `<head>` and `<title>` blocks in one forward
 * pass over the original string (a lowercased copy can change length, e.g.
 * "İ", and shift every index). A lazy regex rescans the rest of the input for
 * every unclosed opening tag, which untrusted mail can turn quadratic; here a
 * missing end is searched for once per name.
 *
 * - A self-closing tag (`<script src=x />`) drops only itself.
 * - A `<head>` also ends at `<body>` or the first body element, since
 *   `</head>` is optional and a later one may belong to quoted HTML.
 * - An unclosed `<title>` drops only its opening tag, so the body survives.
 * - An unclosed `<style>` drops up to the next `<` (CSS has none, markup
 *   follows); an unclosed `<script>` drops the rest of the input, since
 *   script text can contain `<`. Both usually come from `MAX_HTML_CHARS`.
 */
function stripSpecialTagBlocks(html: string): string {
  // `(?=[\s/>])` ends a tag name, so `<header>` and `<head-nav>` are not `<head>`.
  const open = /<(script|style|head|title)(?=[\s/>])/gi;
  const missingEnd = new Set<SpecialTag>();
  const parts: string[] = [];
  let cursor = 0;
  for (let match = open.exec(html); match; match = open.exec(html)) {
    const name = match[1]!.toLowerCase() as SpecialTag;
    parts.push(html.slice(cursor, match.index));
    const tagEnd = openingTagEnd(html, match.index);
    const selfClosing = tagEnd !== null && html[tagEnd - 2] === "/";

    let blockEnd: number | null = null;
    if (tagEnd !== null && !selfClosing && !missingEnd.has(name)) {
      const end = BLOCK_END[name];
      end.lastIndex = tagEnd;
      const found = end.exec(html);
      if (found) blockEnd = found[0].startsWith("</") ? found.index + found[0].length : found.index;
      else missingEnd.add(name);
    }
    if (blockEnd === null) {
      if (tagEnd === null || selfClosing) {
        blockEnd = tagEnd ?? match.index + match[0].length;
      } else if (name === "style") {
        const nextTag = html.indexOf("<", tagEnd);
        blockEnd = nextTag === -1 ? html.length : nextTag;
      } else if (name === "script") {
        blockEnd = html.length;
      } else {
        blockEnd = tagEnd;
      }
    }
    cursor = blockEnd;
    open.lastIndex = cursor;
  }
  parts.push(html.slice(cursor));
  return parts.join("");
}

/** Plain text from HTML for the rare message that arrives without a text part. */
export function htmlToText(html: string): string {
  const text = stripSpecialTagBlocks(stripComments(html.slice(0, MAX_HTML_CHARS)))
    .replace(/<br\b[^<>]*>/gi, "\n")
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
    });
  // Trimmed per line: `/[ \t]+\n/` backtracks quadratically on a long run of spaces.
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
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
