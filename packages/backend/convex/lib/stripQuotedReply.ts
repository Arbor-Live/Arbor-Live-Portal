const WROTE_LINE = /^\s*On\s.+\swrote:\s*$/i;
const ORIGINAL_MESSAGE = /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i;
const UNDERSCORE_RULE = /^\s*_{20,}\s*$/;
const OUTLOOK_FROM = /^\s*From:\s/i;
const OUTLOOK_SENT = /^\s*(Sent|Date):\s/i;
const OUTLOOK_TO_OR_SUBJECT = /^\s*(To|Subject):\s/i;
const SIGNATURE_DASHES = /^\s*--\s*$/;

/** Outlook puts Sent/Date and To/Subject within a few lines of From. */
const OUTLOOK_WINDOW = 4;

function startsGmailWroteLine(lines: string[], i: number) {
  const line = lines[i]!;
  if (WROTE_LINE.test(line)) return true;
  // Gmail wraps a long "On <date>, <name> <address> wrote:" onto a second line.
  if (!/^\s*On\s/i.test(line)) return false;
  const next = lines[i + 1];
  return next !== undefined && WROTE_LINE.test(`${line.trim()} ${next.trim()}`);
}

function startsOutlookBlock(lines: string[], i: number) {
  if (!OUTLOOK_FROM.test(lines[i]!)) return false;
  const window = lines.slice(i + 1, i + 1 + OUTLOOK_WINDOW);
  return window.some((l) => OUTLOOK_SENT.test(l)) && window.some((l) => OUTLOOK_TO_OR_SUBJECT.test(l));
}

function startsQuoteRun(lines: string[], i: number) {
  return lines[i]!.startsWith(">") && (lines[i + 1] ?? "").startsWith(">");
}

/**
 * The reply a person actually wrote: everything before the first quoted-history
 * marker (Gmail/Apple "On … wrote:", Outlook headers, "Original Message", a
 * `>` quote block). Falls back to the whole trimmed text when nothing is left,
 * so a message that is all quote still shows something.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  let cut = lines.length;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (
      startsGmailWroteLine(lines, i) ||
      ORIGINAL_MESSAGE.test(line) ||
      UNDERSCORE_RULE.test(line) ||
      startsOutlookBlock(lines, i) ||
      startsQuoteRun(lines, i)
    ) {
      cut = i;
      break;
    }
  }

  const kept = lines.slice(0, cut);
  while (kept.length > 0) {
    const last = kept[kept.length - 1]!;
    if (last.trim() === "" || SIGNATURE_DASHES.test(last)) kept.pop();
    else break;
  }
  const reply = kept.join("\n").trim();
  return reply === "" ? text.trim() : reply;
}
