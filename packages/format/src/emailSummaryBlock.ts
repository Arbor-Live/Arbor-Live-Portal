import { dateTimeFormat, PORTAL_TIMEZONE } from "./index";

/**
 * The booking-email summary the portal writes into `events.notes` when a quote
 * is approved. The first line is the marker: a later summary finds it and
 * replaces the block in place, and staff text around it is never touched. The
 * block ends at the first line that is not a `- ` bullet, and we always leave a
 * blank line after it. Shared with the web workspace, which carries a freshly
 * written block into a notes draft the user is still editing.
 */
const HEADER_LINE = /^Client email summary \([^)\n]*\)\r?$/;

export function emailSummaryLabelDate(ms: number) {
  return dateTimeFormat("en-US", {
    timeZone: PORTAL_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(ms));
}

/** `label` is e.g. "quote approved Nov 3, 2026". Bullets are one line each. */
export function renderEmailSummaryBlock(label: string, bullets: readonly string[]) {
  return [`Client email summary (${label})`, ...bullets.map((bullet) => `- ${bullet}`)].join("\n");
}

function findBlock(lines: string[]): { start: number; end: number } | null {
  const start = lines.findIndex((line) => HEADER_LINE.test(line));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && lines[end]!.startsWith("- ")) end += 1;
  return { start, end };
}

/** The summary block inside `notes`, or null when there is none. */
export function readEmailSummaryBlock(notes: string | undefined): string | null {
  if (!notes) return null;
  const lines = notes.split("\n");
  const found = findBlock(lines);
  return found ? lines.slice(found.start, found.end).join("\n") : null;
}

/** Replace the existing summary block with `block`, or append it after the staff text. */
export function upsertEmailSummaryBlock(notes: string | undefined, block: string) {
  const text = notes ?? "";
  if (!text.trim()) return block;
  const lines = text.split("\n");
  const found = findBlock(lines);
  if (!found) return `${text.replace(/\s+$/, "")}\n\n${block}`;
  return [...lines.slice(0, found.start), ...block.split("\n"), ...lines.slice(found.end)].join("\n");
}
