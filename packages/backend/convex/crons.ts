import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "schedule reminders",
  { hourUTC: 17, minuteUTC: 0 },
  internal.email.reminders.run,
);

crons.daily(
  "payment proof first reminders",
  { hourUTC: 17, minuteUTC: 0 },
  internal.email.paymentProofReminders.runFirst,
);

crons.daily(
  "post event album reminders",
  { hourUTC: 17, minuteUTC: 0 },
  internal.email.postEventAlbumReminders.run,
);

crons.daily(
  "print event briefs",
  { hourUTC: 13, minuteUTC: 0 },
  internal.printJobs.enqueueDue,
);

crons.daily(
  "promote ended band payments",
  { hourUTC: 18, minuteUTC: 0 },
  internal.bandPayments.promoteEndedPayments,
);

crons.cron(
  "weekly jobs",
  "0 17 * * 1",
  internal.weeklyJobs.run,
);

crons.cron(
  "prune expired rate limit rows",
  "0 4 * * *",
  internal.rateLimit.pruneExpired,
  {},
);

crons.interval(
  "prune expired short links",
  { hours: 24 },
  internal.shortLinks.pruneExpired,
  {},
);

crons.cron(
  "prune orphaned r2 assets",
  "0 5 * * *",
  internal.r2Assets.pruneOrphans,
  {},
);

crons.cron(
  "prune old print jobs",
  "0 6 * * *",
  internal.printJobs.pruneOldJobs,
  {},
);

crons.cron(
  "prune old email notifications",
  "30 4 * * *",
  internal.retention.pruneEmailNotifications,
  {},
);

crons.cron(
  "prune old status transitions",
  "35 4 * * *",
  internal.retention.pruneStatusTransitions,
  {},
);

export default crons;
