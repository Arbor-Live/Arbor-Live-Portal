import type {
  BookingQuoteReadyEmailProps,
  BookingRequestReceivedEmailProps,
  EventEmailProps,
  PasswordResetEmailProps,
  PaymentProofReminderEmailProps,
  PaymentProofSubmittedEmailProps,
  PayingPartyAddedEmailProps,
  SchedulePublishedEmailProps,
  ScheduleReminderEmailProps,
  UserInviteEmailProps,
} from "../src/types";
import { ARBOR_WEBSITE_URL } from "./_components/brand-theme";

const eventDefaults = {
  eventTitle: "Spring Concert 2026",
  venueName: "Memorial Auditorium",
  dateRangeLabel: "Saturday, Apr 12, 2026 • 6:00 PM – 11:00 PM",
  eventUrl: `${ARBOR_WEBSITE_URL}/dashboard/events/demo-event`,
  recipientName: "Jordan Lee",
};

export const eventCancelledPreviewProps: EventEmailProps = {
  ...eventDefaults,
};

export const schedulePublishedPreviewProps: SchedulePublishedEmailProps = {
  ...eventDefaults,
  blockSummaries: [
    "Setup • 2:00 PM – 5:00 PM",
    "Show • 6:00 PM – 10:00 PM",
    "Strike • 10:00 PM – 11:30 PM",
  ],
};

export const scheduleReminderPreviewProps: ScheduleReminderEmailProps = {
  ...eventDefaults,
  daysUntilEvent: 7,
};

export const userInvitePreviewProps: UserInviteEmailProps = {
  organizationName: "Arbor Live",
  inviterName: "Alex Chen",
  inviteUrl: `${ARBOR_WEBSITE_URL}/accept-invite?token=demo-token`,
  recipientEmail: "jordan.lee@stanford.edu",
  isExistingUser: false,
  expiresAtLabel: "Monday, Jul 7, 2026 at 5:00 PM PT",
};

export const passwordResetPreviewProps: PasswordResetEmailProps = {
  recipientName: "Jordan Lee",
  resetUrl: `${ARBOR_WEBSITE_URL}/reset-password?token=demo`,
};

export const bookingRequestReceivedPreviewProps: BookingRequestReceivedEmailProps = {
  recipientName: "Jordan Lee",
  requestNumber: "ALREQ-4K8Z2NP",
  eventName: "Spring Concert 2026",
  eventDateText: "Saturday, Apr 12, 2026",
  trackingUrl: `${ARBOR_WEBSITE_URL}/public/request/track/demo-request`,
};

export const bookingQuoteReadyPreviewProps: BookingQuoteReadyEmailProps = {
  recipientName: "Jordan Lee",
  requestNumber: "ALREQ-4K8Z2NP",
  eventName: "Spring Concert 2026",
  invoiceNumber: "ALINV-4K8Z2NP",
  quoteTotalUsd: 4250,
  trackingUrl: `${ARBOR_WEBSITE_URL}/public/request/track/demo-request`,
  managerName: "Alex Chen",
  managerEmail: "alex.chen@stanford.edu",
};

export const paymentProofReminderPreviewProps: PaymentProofReminderEmailProps = {
  recipientName: "Jordan Lee",
  eventTitle: eventDefaults.eventTitle,
  venueName: eventDefaults.venueName,
  dateRangeLabel: eventDefaults.dateRangeLabel,
  invoiceNumber: "ALINV-4K8Z2NP",
  quoteTotalUsd: 4250,
  portalUrl: `${ARBOR_WEBSITE_URL}/public/event/demo-event`,
  reminderKind: "first",
  lateFeeUsd: 25,
  isOverdue: false,
  weeksUntilLateFee: 4,
};

export const paymentProofSubmittedPreviewProps: PaymentProofSubmittedEmailProps = {
  recipientName: "Jordan Lee",
  eventTitle: eventDefaults.eventTitle,
  venueName: eventDefaults.venueName,
  dateRangeLabel: eventDefaults.dateRangeLabel,
  invoiceNumber: "ALINV-4K8Z2NP",
  quoteTotalUsd: 4250,
  paymentMethodLabel: "ASSU ePay",
  paymentReference: "EPAY-20260412-001",
  financeContactEmail: "finance@stanford.edu",
  portalUrl: `${ARBOR_WEBSITE_URL}/public/event/demo-event`,
  managerName: "Alex Chen",
  managerEmail: "alex.chen@stanford.edu",
};

export const payingPartyAddedPreviewProps: PayingPartyAddedEmailProps = {
  recipientName: "Jordan Lee",
  approvedByName: "Sam Rivera",
  clientGroupName: "Stanford Concert Network",
  eventTitle: eventDefaults.eventTitle,
  venueName: eventDefaults.venueName,
  dateRangeLabel: eventDefaults.dateRangeLabel,
  invoiceNumber: "ALINV-4K8Z2NP",
  quoteTotalUsd: 4250,
  managerName: "Alex Chen",
  managerEmail: "alex.chen@stanford.edu",
};
