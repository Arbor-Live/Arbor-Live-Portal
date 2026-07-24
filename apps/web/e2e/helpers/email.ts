import { pollConvex, runConvex } from "./convex";

export type EmailNotificationRow = {
  id: string;
  template: string;
  status: "queued" | "sent" | "failed";
  to: string;
  subject: string;
  resendId?: string;
  error?: string;
  createdAt: number;
  sentAt?: number;
};

/** Local e2e recipient — used with E2E_EMAIL_MOCK (no Resend quota). */
export function e2eTestEmail(label: string) {
  const safe = label.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 40);
  return `e2e+${safe}@arborlive.test`;
}

export function getLatestEmailNotification(args: {
  to?: string;
  template?: string;
  afterCreatedAt?: number;
}) {
  return runConvex("e2eHelpers:getLatestEmailNotification", args) as EmailNotificationRow | null;
}

export async function waitForSentEmail(args: {
  to?: string;
  template?: string;
  afterCreatedAt?: number;
}) {
  return pollConvex<EmailNotificationRow>(
    "e2eHelpers:getLatestEmailNotification",
    args,
    (row) => Boolean(row && row.status === "sent" && row.resendId),
    { attempts: 60, delayMs: 1000 },
  );
}
