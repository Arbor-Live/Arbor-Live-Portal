import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "schedule reminders",
  { hourUTC: 17, minuteUTC: 0 },
  internal.email.reminders.run,
);

export default crons;
