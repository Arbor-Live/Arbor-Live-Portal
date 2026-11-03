// @vitest-environment edge-runtime
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { internal } from "../_generated/api";
import { seedEvent } from "../test/bookingSeeds.helpers";
import { makeTest, type Test } from "../test/setup.helpers";
import { REMINDER_EVENT_BATCH_SIZE } from "./paymentProofReminderShared";

const NOW = Date.UTC(2026, 10, 3, 17);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

type Continuation = (typeof internal.email.paymentProofReminders.continueRun)["_args"];

async function pendingContinuations(t: Test): Promise<Continuation[]> {
  return await t.run(async (ctx) =>
    (await ctx.db.system.query("_scheduled_functions").collect())
      .filter((row) => row.name.endsWith("continueRun") && row.state.kind === "pending")
      .map((row) => row.args[0] as Continuation),
  );
}

it("walks the events in batches, then the unlinked invoices, with one fixed clock", async () => {
  const t = makeTest();
  for (let i = 0; i <= REMINDER_EVENT_BATCH_SIZE; i += 1) await seedEvent(t);

  expect(await t.mutation(internal.email.paymentProofReminders.runFirst, {})).toEqual({
    enqueuedCount: 0,
  });
  const [second] = await pendingContinuations(t);
  expect(second).toMatchObject({
    mode: "first",
    run: { now: NOW, phase: "events", remindedInvoiceIds: [] },
  });
  expect(second!.run.cursor).toEqual(expect.any(String));

  vi.setSystemTime(NOW + 60_000);
  await t.mutation(internal.email.paymentProofReminders.continueRun, second!);
  const third = (await pendingContinuations(t)).find((c) => c.run.phase === "unlinked");
  expect(third).toEqual({
    mode: "first",
    run: { now: NOW, phase: "unlinked", cursor: null, remindedInvoiceIds: [] },
  });

  await t.mutation(internal.email.paymentProofReminders.continueRun, third!);
  // The unlinked pass is the last: nothing new is scheduled after it.
  const after = await pendingContinuations(t);
  expect(after.filter((c) => c.run.phase === "unlinked")).toHaveLength(1);
  expect(after).toHaveLength(2);
});
