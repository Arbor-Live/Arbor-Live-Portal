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

export type CrewScheduledEmailProps = EventEmailProps & {
  eventLeadName?: string;
  assignmentSummaries: string[];
  fullScheduleSummaries: string[];
  coversEntireEvent: boolean;
};

export type CrewScheduledIcsEventPayload = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  startAt: number;
  endAt: number;
};

export type CrewScheduledEmailPayload = CrewScheduledEmailProps & {
  icsEvents: CrewScheduledIcsEventPayload[];
  timezone: string;
};

export type CrewUnscheduledEmailProps = EventEmailProps & {
  eventLeadName?: string;
  previousAssignmentSummaries: string[];
};

export type CrewUnscheduledEmailPayload = CrewUnscheduledEmailProps & {
  icsEvents: CrewScheduledIcsEventPayload[];
  timezone: string;
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

export type EmailVerificationEmailProps = {
  recipientName?: string;
  verificationUrl: string;
};

export type ChangeEmailConfirmationEmailProps = {
  recipientName?: string;
  newEmail: string;
  confirmUrl: string;
};

export type BookingRequestReceivedEmailProps = {
  recipientName?: string;
  requestNumber: string;
  eventName: string;
  eventDateText: string;
  trackingUrl: string;
};

export type BookingRequestAdminEmailProps = {
  requesterName: string;
  requesterEmail: string;
  requestNumber: string;
  eventName: string;
  eventDateText: string;
  organization?: string;
  reviewUrl: string;
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
  managerMessage: string;
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

export type BandPaymentConfirmationEmailProps = {
  recipientName?: string;
  eventTitle: string;
  venueName?: string;
  eventDateLabel: string;
  performanceHoursLabel: string;
  pricingMode: "per_member_hourly" | "fixed_total";
  ratePerMemberPerHourUsd?: number;
  totalUsd: number;
  designatedPayeeName: string;
  photoAlbumUrl?: string;
  confirmationToken: string;
  signUrl: string;
};

export type BandPaymentCompletedEmailProps = {
  recipientName?: string;
  bandName: string;
  eventTitle: string;
  venueName?: string;
  dateRangeLabel: string;
  totalUsd: number;
  servicePaymentNumber: string;
  designatedPayeeName: string;
};

export type BandPaymentPayeeRequiredEmailProps = {
  recipientName?: string;
  bandName: string;
  eventTitle: string;
  venueName?: string;
  eventDateLabel: string;
  payeeSettingsUrl: string;
};

export type OnboardingCompletedEmailProps = {
  crewName: string;
  crewEmail: string;
  hasFederalWorkStudy: boolean;
  hasValidDriversLicense: boolean;
  signatureLegalName: string;
  dashboardUsersUrl: string;
};

export type OnboardingReminderEmailProps = {
  recipientName?: string;
  onboardingUrl: string;
  incompleteStepCount: number;
};

export type BandApplicationReceivedEmailProps = {
  bandName: string;
  contactName: string;
  contactEmail: string;
  reviewUrl: string;
};

export type BandApplicationDecisionEmailProps = {
  recipientName?: string;
  bandName: string;
  acceptInviteUrl?: string;
  declineReason?: string;
};

export type BandApplicationConfirmationEmailProps = {
  recipientName?: string;
  bandName: string;
};

export type CrewApplicationReceivedEmailProps = {
  applicantName: string;
  applicantEmail: string;
  vertical: string;
  reviewUrl: string;
};

export type CrewApplicationClosedEmailProps = {
  recipientName?: string;
};

export type CrewApplicationConfirmationEmailProps = {
  recipientName?: string;
  vertical?: string;
};

export type CrewTraineeIntroContact = {
  role: "event_manager" | "day_of_lead";
  name: string;
  email: string;
  phone: string;
};

export type CrewTraineeIntroEmailProps = {
  recipientName?: string;
  eventTitle: string;
  dateRangeLabel: string;
  venueName: string;
  venueAddress: string;
  venueGoogleMapsUrl?: string;
  storageClosetLabel: string;
  storageClosetMapsUrl: string;
  callTimeLabel: string;
  contacts: CrewTraineeIntroContact[];
  contactsCollapsed: boolean;
  arborContactEmail: string;
};

export type RentalOutboundPackedEmailProps = {
  recipientName?: string;
  eventTitle: string;
  venueName?: string;
  dateRangeLabel: string;
  fulfillmentMode: "delivery" | "will_call";
  itemSummaries: string[];
  eventUrl: string;
};

export type RentalReturnProcessedEmailProps = {
  recipientName?: string;
  eventTitle: string;
  venueName?: string;
  dateRangeLabel: string;
  exceptionItems: Array<{
    label: string;
    assetId?: string;
    status: "missing" | "damaged";
  }>;
  eventUrl: string;
};
