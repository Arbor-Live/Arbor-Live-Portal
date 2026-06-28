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
