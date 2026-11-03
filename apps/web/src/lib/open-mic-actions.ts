import { useMutation } from "convex/react";
import { useAppDialog } from "@/components/ui/app-dialog";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { optimisticSetOpenMicStatus } from "@/lib/open-mic-optimistic";
import { formatNightStart, type OpenMicStatus } from "@/lib/open-mic-status";

/** Runs a mutation, toasts the server's message on failure, and returns whether it succeeded. */
export async function attempt(action: () => Promise<unknown>) {
  try {
    await action();
    return true;
  } catch (error) {
    notify.error(getConvexErrorMessage(error));
    return false;
  }
}

/** Moves a night to a new status, confirming the ones that end it. Shared by the runner and the night list. */
export function useSetOpenMicStatus() {
  const { confirm } = useAppDialog();
  const setStatus = useMutation(api.openMic.setOpenMicStatus).withOptimisticUpdate(optimisticSetOpenMicStatus);

  return async (event: { _id: Id<"events">; title: string; startAt: number }, status: OpenMicStatus) => {
    const night = `${event.title} (${formatNightStart(event.startAt)})`;
    if (status === "completed") {
      const ok = await confirm({
        title: `Mark ${night} completed?`,
        description: "Sign-ups close. Whoever is on stage is counted as performed.",
        confirmLabel: "Mark completed",
      });
      if (!ok) return false;
    }
    if (status === "cancelled") {
      const ok = await confirm({
        title: `Cancel ${night}?`,
        description: "Sign-ups close and the runner stops. The queue stays on record.",
        confirmLabel: "Cancel night",
        destructive: true,
      });
      if (!ok) return false;
    }
    return attempt(() => setStatus({ eventId: event._id, status }));
  };
}
