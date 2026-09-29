"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex-api";
import { useSessionShell } from "@/components/session-shell-provider";
import { Button } from "@/components/ui/button";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";

/**
 * Shown to an `inactive` viewer (a real account that isn't currently crew).
 * They keep their login and can bring themselves back without an admin.
 */
export function InactiveAccountBanner() {
  const shell = useSessionShell();
  const reactivate = useMutation(api.users.reactivateMyAccount);
  const [busy, setBusy] = useState(false);

  if (shell?.viewer.status !== "inactive") return null;

  async function onReactivate() {
    setBusy(true);
    try {
      await reactivate({});
      notify.success("Your account is active again. You'll start receiving crew emails.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-status-amber-500/30 bg-status-amber-500/10 px-4 py-2 text-sm">
      <p className="text-foreground/80">
        Your account is inactive, so you aren&apos;t counted for availability or getting weekly
        emails. Reactivate to start receiving crew emails again.
      </p>
      <Button type="button" size="sm" disabled={busy} onClick={() => void onReactivate()}>
        Reactivate
      </Button>
    </div>
  );
}
