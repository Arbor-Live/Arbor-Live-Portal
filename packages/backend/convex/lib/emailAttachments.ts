export const RESEND_RECEIVING_URL = "https://api.resend.com/emails/receiving";

export type ResendAttachment = {
  id: string;
  filename?: string;
  contentType?: string;
  downloadUrl: string;
};

/** Parse failures drop the entry: an attachment with no download link cannot be copied. */
export function parseResendAttachment(raw: unknown): ResendAttachment | null {
  if (typeof raw !== "object" || raw === null) return null;
  const entry = raw as Record<string, unknown>;
  const text = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;
  const id = text(entry.id);
  const downloadUrl = text(entry.download_url);
  if (!id || !downloadUrl) return null;
  return {
    id,
    filename: text(entry.filename),
    contentType: text(entry.content_type),
    downloadUrl,
  };
}

/**
 * The provider's entry for `stored[index]` when we kept no attachment id: the
 * entry with the same filename, taking the Nth when several share it, where N
 * is how many earlier stored attachments share the name. A missing filename
 * is stored as "attachment" (`parseReceivedEmail`).
 */
export function pickAttachmentByFilename(
  listed: ResendAttachment[],
  stored: { filename: string }[],
  index: number,
): ResendAttachment | null {
  const filename = stored[index]?.filename;
  if (filename === undefined) return null;
  const ordinal = stored.slice(0, index).filter((entry) => entry.filename === filename).length;
  const sameName = listed.filter((entry) => (entry.filename ?? "attachment") === filename);
  return sameName[ordinal] ?? null;
}

export function attachmentSourceKey(messageId: string, index: number) {
  return `${messageId}:${index}`;
}
