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
  "promote ended band payments",
  { hourUTC: 18, minuteUTC: 0 },
  internal.bandPayments.promoteEndedPayments,
);

crons.cron(
  "prune expired rate limit rows",
  "0 4 * * *",
  internal.rateLimit.pruneExpired,
  {},
);

export default crons;
