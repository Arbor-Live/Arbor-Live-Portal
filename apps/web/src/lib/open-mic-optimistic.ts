import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api, type Id } from "@/lib/convex-api";
import type { OpenMicStatus } from "@/lib/open-mic-status";

type RunnerState = NonNullable<FunctionReturnType<typeof api.openMic.getRunnerState>>;
type RunnerSignup = RunnerState["signups"][number];
type EventSummary = FunctionReturnType<typeof api.openMic.listEvents>[number];

function patchRunnerState(
  localStore: OptimisticLocalStore,
  eventId: Id<"events">,
  updater: (current: RunnerState) => RunnerState,
) {
  const current = localStore.getQuery(api.openMic.getRunnerState, { eventId });
  if (!current) return;
  localStore.setQuery(api.openMic.getRunnerState, { eventId }, updater(current));
}

function findRunnerEventIdForSignup(
  localStore: OptimisticLocalStore,
  signupId: Id<"openMicSignups">,
): Id<"events"> | null {
  for (const entry of localStore.getAllQueries(api.openMic.getRunnerState)) {
    if (!entry.value) continue;
    if (entry.value.signups.some((signup) => signup._id === signupId)) {
      return entry.args.eventId;
    }
  }
  return null;
}

function queuedSorted(signups: RunnerSignup[]) {
  return signups
    .filter((signup) => signup.status === "queued")
    .sort((a, b) => a.position - b.position);
}

function promoteFirstQueued(
  signups: RunnerSignup[],
  options?: { skipSignupId?: Id<"openMicSignups"> },
): RunnerSignup[] {
  const queued = queuedSorted(signups);
  const next = options?.skipSignupId
    ? queued.find((signup) => signup._id !== options.skipSignupId) ?? null
    : queued[0] ?? null;
  if (!next) return signups;

  return signups.map((signup) => {
    if (signup._id !== next._id) return signup;
    return {
      ...signup,
      status: "current" as const,
      skipsCount: 0,
    };
  });
}

export function optimisticAdvanceCurrent(
  localStore: OptimisticLocalStore,
  args: { eventId: Id<"events"> },
) {
  const current = localStore.getQuery(api.openMic.getRunnerState, { eventId: args.eventId });
  if (!current) return;

  const now = Date.now();
  const onStage = current.signups.find((signup) => signup.status === "current") ?? null;
  let signups = current.signups.map((signup) => {
    if (signup._id !== onStage?._id) return signup;
    return {
      ...signup,
      status: "performed" as const,
      performedAt: now,
    };
  });
  signups = promoteFirstQueued(signups);

  localStore.setQuery(api.openMic.getRunnerState, { eventId: args.eventId }, {
    ...current,
    signups,
  });
}

export function optimisticMarkNotHere(
  localStore: OptimisticLocalStore,
  args: { signupId: Id<"openMicSignups"> },
) {
  const eventId = findRunnerEventIdForSignup(localStore, args.signupId);
  if (!eventId) return;

  patchRunnerState(localStore, eventId, (current) => {
    const target = current.signups.find((signup) => signup._id === args.signupId);
    if (!target || target.status !== "current") return current;

    const now = Date.now();
    let bumpedToFront = false;
    let signups: RunnerSignup[];

    if (target.skipsCount >= 2) {
      signups = current.signups.map((signup) => {
        if (signup._id !== target._id) return signup;
        return { ...signup, status: "removed" as const };
      });
    } else {
      const nextSkips = target.skipsCount + 1;
      if (nextSkips === 1) {
        const front = queuedSorted(current.signups)[0];
        const frontPosition = front ? front.position : now;
        bumpedToFront = true;
        signups = current.signups.map((signup) => {
          if (signup._id !== target._id) return signup;
          return {
            ...signup,
            status: "queued" as const,
            skipsCount: nextSkips,
            position: frontPosition - 1,
          };
        });
      } else {
        const lastPosition = current.signups.reduce(
          (max, signup) => Math.max(max, signup.position),
          now,
        );
        signups = current.signups.map((signup) => {
          if (signup._id !== target._id) return signup;
          return {
            ...signup,
            status: "queued" as const,
            skipsCount: nextSkips,
            position: lastPosition + 1,
          };
        });
      }
    }

    signups = promoteFirstQueued(signups, {
      skipSignupId: bumpedToFront ? target._id : undefined,
    });

    return { ...current, signups };
  });
}

export function optimisticRemoveSignup(
  localStore: OptimisticLocalStore,
  args: { signupId: Id<"openMicSignups"> },
) {
  const eventId = findRunnerEventIdForSignup(localStore, args.signupId);
  if (!eventId) return;

  patchRunnerState(localStore, eventId, (current) => {
    const target = current.signups.find((signup) => signup._id === args.signupId);
    if (!target) return current;

    const wasCurrent = target.status === "current";
    let signups = current.signups.filter((signup) => signup._id !== args.signupId);
    if (wasCurrent) {
      signups = promoteFirstQueued(signups);
    }
    return { ...current, signups };
  });
}

export function optimisticSetOpenMicStatus(
  localStore: OptimisticLocalStore,
  args: { eventId: Id<"events">; status: OpenMicStatus },
) {
  const list = localStore.getQuery(api.openMic.listEvents, {});
  if (list === undefined) return;

  const next: EventSummary[] = list.map((event) =>
    event._id === args.eventId ? { ...event, status: args.status } : event,
  );
  localStore.setQuery(api.openMic.listEvents, {}, next);

  const runner = localStore.getQuery(api.openMic.getRunnerState, { eventId: args.eventId });
  if (runner) {
    localStore.setQuery(api.openMic.getRunnerState, { eventId: args.eventId }, {
      ...runner,
      event: { ...runner.event, status: args.status },
    });
  }
}
