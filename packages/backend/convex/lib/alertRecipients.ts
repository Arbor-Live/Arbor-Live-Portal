/** Cap a recipient list so a bad paste can't fan out to hundreds of addresses. */
export const MAX_ALERT_RECIPIENTS = 25;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Trim, lowercase, and dedupe a settings-managed recipient list, rejecting
 * malformed addresses and oversized lists with named errors. External
 * addresses are allowed (they simply have no portal account to notify).
 */
export function normalizeAlertRecipients(emails: string[]): string[] {
  const recipients = [
    ...new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean)),
  ];
  const invalid = recipients.find((email) => !EMAIL_RE.test(email));
  if (invalid) throw new Error(`"${invalid}" is not a valid email address.`);
  if (recipients.length > MAX_ALERT_RECIPIENTS) {
    throw new Error(
      `Too many recipients (max ${MAX_ALERT_RECIPIENTS}, got ${recipients.length}).`,
    );
  }
  return recipients;
}
