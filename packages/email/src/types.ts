export type EventEmailProps = {
  eventTitle: string;
  venueName?: string;
  dateRangeLabel: string;
  eventUrl: string;
  recipientName?: string;
};

export type SchedulePublishedEmailProps = EventEmailProps & {
  blockSummaries: string[];
};

export type ScheduleReminderEmailProps = EventEmailProps & {
  daysUntilEvent: number;
};

export type UserInviteEmailProps = {
  organizationName: string;
  inviterName: string;
  inviteUrl: string;
  recipientEmail: string;
  isExistingUser: boolean;
  expiresAtLabel: string;
};

export type PasswordResetEmailProps = {
  recipientName?: string;
  resetUrl: string;
};

export type BookingRequestReceivedEmailProps = {
  recipientName?: string;
  requestNumber: string;
  eventName: string;
  eventDateText: string;
  trackingUrl: string;
};

export type BookingQuoteReadyEmailProps = {
  recipientName?: string;
  requestNumber: string;
  eventName?: string;
  invoiceNumber: string;
  quoteTotalUsd: number;
  trackingUrl: string;
  managerName: string;
  managerEmail?: string;
};

export type PaymentProofReminderEmailProps = {
  recipientName?: string;
  eventTitle: string;
  venueName?: string;
  dateRangeLabel: string;
  invoiceNumber: string;
  quoteTotalUsd: number;
  portalUrl: string;
  reminderKind: "first" | "weekly";
  lateFeeUsd: number;
  isOverdue: boolean;
  weeksUntilLateFee: number;
};

export type PaymentProofSubmittedEmailProps = {
  recipientName?: string;
  eventTitle: string;
  venueName?: string;
  dateRangeLabel: string;
  invoiceNumber: string;
  quoteTotalUsd: number;
  paymentMethodLabel: string;
  paymentReference: string;
  financeContactEmail?: string;
  portalUrl: string;
  managerName: string;
  managerEmail?: string;
};

export type PayingPartyAddedEmailProps = {
  recipientName?: string;
  approvedByName: string;
  clientGroupName?: string;
  eventTitle: string;
  venueName?: string;
  dateRangeLabel: string;
  invoiceNumber: string;
  quoteTotalUsd: number;
  managerName: string;
  managerEmail?: string;
};
