/**
 * Stub for future calendar invite (.ics) attachments on schedule publish.
 * Resend supports attachments via the sendEmail options when this is implemented.
 */
export type EventIcsInput = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  organizerEmail: string;
  attendeeEmails: string[];
};

export function buildEventIcs(_input: EventIcsInput): string {
  throw new Error("ICS calendar invites are not implemented yet.");
}
