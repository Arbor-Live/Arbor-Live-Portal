import type {
  BookingQuoteReadyEmailProps,
  BookingRequestReceivedEmailProps,
  EventEmailProps,
  PasswordResetEmailProps,
  PaymentProofReminderEmailProps,
  PaymentProofSubmittedEmailProps,
  PayingPartyAddedEmailProps,
  BandPaymentConfirmationEmailProps,
  BandPaymentCompletedEmailProps,
  BandPaymentPayeeRequiredEmailProps,
  CrewScheduledEmailProps,
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

export const crewScheduledPreviewProps: CrewScheduledEmailProps = {
  ...eventDefaults,
  eventLeadName: "Alex Chen",
  assignmentSummaries: ["Setup • Lighting Tech • 2:00 PM – 5:00 PM"],
  fullScheduleSummaries: [
    "Setup • 2:00 PM – 5:00 PM",
    "Show • 6:00 PM – 10:00 PM",
    "Strike • 10:00 PM – 11:30 PM",
  ],
  coversEntireEvent: false,
};

export const crewScheduledFullEventPreviewProps: CrewScheduledEmailProps = {
  ...eventDefaults,
  eventLeadName: "Alex Chen",
  assignmentSummaries: [
    "Setup • Lighting Tech • 2:00 PM – 5:00 PM",
    "Show • Lighting Tech • 6:00 PM – 10:00 PM",
    "Strike • Lighting Tech • 10:00 PM – 11:30 PM",
  ],
  fullScheduleSummaries: [],
  coversEntireEvent: true,
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

export const bandPaymentConfirmationPreviewProps: BandPaymentConfirmationEmailProps = {
  recipientName: "Jules",
  eventTitle: "Senior Night",
  venueName: "Arbor Stage",
  eventDateLabel: "5/29/26",
  performanceHoursLabel: "0.75 hrs",
  pricingMode: "per_member_hourly",
  ratePerMemberPerHourUsd: 150,
  totalUsd: 562.5,
  designatedPayeeName: "Jules Jackson",
  photoAlbumUrl: "https://photos.arbor.st/share/demo-album",
  confirmationToken: "ALBPAY-demo123",
};

export const bandPaymentCompletedPreviewProps: BandPaymentCompletedEmailProps = {
  recipientName: "Jordan Lee",
  bandName: "The Stanford Band",
  eventTitle: "Senior Night",
  venueName: "Arbor Stage",
  dateRangeLabel: eventDefaults.dateRangeLabel,
  totalUsd: 562.5,
  servicePaymentNumber: "SP-2026-0042",
  designatedPayeeName: "Jules Jackson",
};

export const bandPaymentPayeeRequiredPreviewProps: BandPaymentPayeeRequiredEmailProps = {
  recipientName: "Jordan Lee",
  bandName: "The Stanford Band",
  eventTitle: "Senior Night",
  venueName: "Arbor Stage",
  eventDateLabel: "5/29/26",
  payeeSettingsUrl: "https://portal.arbor.st/dashboard/bands-and-performers#payment-payee",
};
