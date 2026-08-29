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

crons.cron(
  "payment proof monday reminders",
  "0 17 * * 1",
  internal.email.paymentProofReminders.runMonday,
);

crons.daily(
  "post event album reminders",
  { hourUTC: 17, minuteUTC: 0 },
  internal.email.postEventAlbumReminders.run,
);

crons.daily(
  "promote ended band payments",
  { hourUTC: 18, minuteUTC: 0 },
  internal.bandPayments.promoteEndedPayments,
);

crons.cron(
  "onboarding incomplete reminders",
  "0 17 * * 1",
  internal.onboarding.remindIncomplete,
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

export default crons;
