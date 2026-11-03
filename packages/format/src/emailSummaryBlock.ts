/**
 * The client-email summary the portal writes into `events.notes`, one block per
 * invoice:
 *
 *   Client email summary · ALINV-0042 · quote approved Nov 3, 2026
 *   - Load-in through the Lagunita lot after 3pm
 *   (end of client email summary)
 *
 * Staff text in notes is never deleted or altered. The caller keeps the exact
 * text it last wrote; a block is replaced only while it still reads exactly
 * that, and every other case (staff edited or deleted it, or typed something
 * that looks like it) appends a fresh block and leaves every existing line as
 * it was.
 */
export const EMAIL_SUMMARY_HEADER = "Client email summary";
export const EMAIL_SUMMARY_END_LINE = "(end of client email summary)";

const HEADER_PREFIX = `${EMAIL_SUMMARY_HEADER} · `;

function keyedHeaderPrefix(invoiceNumber: string) {
  return `${HEADER_PREFIX}${invoiceNumber} · `;
}

/** `label` is e.g. "quote approved Nov 3, 2026" or "as of Nov 3, 2026". Lines join with "\n". */
export function renderEmailSummaryBlock(args: {
  invoiceNumber: string;
  label: string;
  bullets: readonly string[];
}) {
  return [
    `${keyedHeaderPrefix(args.invoiceNumber)}${args.label}`,
    ...args.bullets.map((bullet) => `- ${bullet}`),
    EMAIL_SUMMARY_END_LINE,
  ].join("\n");
}

type Line = { start: number; end: number; text: string };

/** Lines with their offsets; `end` excludes the line break, including a CRLF's "\r". */
function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (;;) {
    const newline = text.indexOf("\n", start);
    const breakAt = newline === -1 ? text.length : newline;
    const end = breakAt > start && text[breakAt - 1] === "\r" ? breakAt - 1 : breakAt;
    lines.push({ start, end, text: text.slice(start, end) });
    if (newline === -1) return lines;
    start = newline + 1;
  }
}

/**
 * Every complete block keyed to this invoice, as offsets into `notes`: a header
 * line with exactly this invoice number, through the first end line. A header
 * with no end line before the next header (or the end of the notes) is not a
 * block.
 */
export function findEmailSummaryBlocks(notes: string, invoiceNumber: string) {
  const prefix = keyedHeaderPrefix(invoiceNumber);
  const lines = splitLines(notes);
  const blocks: { start: number; end: number }[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i]!.text.startsWith(prefix)) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      const text = lines[j]!.text;
      if (text === EMAIL_SUMMARY_END_LINE) {
        blocks.push({ start: lines[i]!.start, end: lines[j]!.end });
        i = j;
        break;
      }
      if (text.startsWith(HEADER_PREFIX)) break;
    }
  }
  return blocks;
}

/**
 * Put `block` into `notes`. `previous` is the exact block text the portal last
 * wrote for this invoice on this event (null if none): a keyed block reading
 * exactly that is replaced in place; otherwise `block` is appended after a
 * blank line. Text outside the replaced block is returned byte for byte.
 */
export function writeEmailSummaryBlock(
  notes: string | undefined,
  args: { invoiceNumber: string; block: string; previous: string | null },
): { notes: string; mode: "replaced" | "appended" } {
  const text = notes ?? "";
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const rendered = args.block.split("\n").join(eol);

  if (args.previous !== null) {
    for (const { start, end } of findEmailSummaryBlocks(text, args.invoiceNumber)) {
      if (text.slice(start, end).replace(/\r\n/g, "\n") === args.previous) {
        return { notes: `${text.slice(0, start)}${rendered}${text.slice(end)}`, mode: "replaced" };
      }
    }
  }

  if (text === "") return { notes: rendered, mode: "appended" };
  const separator = /\r?\n[ \t]*\r?\n$/.test(text) ? "" : /\r?\n$/.test(text) ? eol : eol + eol;
  return { notes: `${text}${separator}${rendered}`, mode: "appended" };
}
