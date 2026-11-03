import type { FunctionReturnType } from "convex/server";
import type { api } from "@/lib/convex-api";

type RunnerState = NonNullable<FunctionReturnType<typeof api.openMic.getRunnerState>>;
export type RunnerSignup = RunnerState["signups"][number];

export type RunnerView = {
  current: RunnerSignup | null;
  queued: RunnerSignup[];
  performed: RunnerSignup[];
};

/** Splits a night's sign-ups into who is on stage, the queue in call-up order, and tonight's finished sets. */
export function deriveRunnerView(signups: readonly RunnerSignup[]): RunnerView {
  const current = signups.find((signup) => signup.status === "current") ?? null;
  const queued = signups
    .filter((signup) => signup.status === "queued")
    .sort((a, b) => a.position - b.position);
  const performed = signups
    .filter((signup) => signup.status === "performed")
    .sort((a, b) => (b.performedAt ?? 0) - (a.performedAt ?? 0));
  return { current, queued, performed };
}
