"use client";

import { useAction, useMutation } from "convex/react";
import { useState } from "react";
import { CaretDownIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { downloadBytes } from "@/lib/download-bytes";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * Always-available event brief: view (download the PDF) or queue it for the
 * warehouse printer. Unlike the night rider, this renders for every event —
 * band input/changeover pages are appended only when bands have riders.
 */
export function EventBriefButton({
  eventId,
  className,
}: {
  eventId: Id<"events">;
  className?: string;
}) {
  const download = useAction(api.eventBriefDownload.downloadBriefByEventId);
  const queuePrint = useMutation(api.printJobs.reprint);
  const { alert } = useAppDialog();
  const [pending, setPending] = useState<"view" | "print" | null>(null);

  async function onView() {
    setPending("view");
    try {
      const result = await download({ eventId });
      downloadBytes(result.bytes, result.fileName);
    } catch {
      notify.error("Couldn’t build the brief.");
    } finally {
      setPending(null);
    }
  }

  async function onPrint() {
    setPending("print");
    try {
      const jobId = await queuePrint({ eventId });
      if (jobId) {
        notify.success("Brief queued for printing.");
      } else {
        await alert("No enabled printer is configured yet, so the brief wasn’t queued.");
      }
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn’t queue the brief for printing."));
    } finally {
      setPending(null);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={pending !== null}
          className={cn(className)}
        >
          {pending ? "Working…" : "Brief"}
          <CaretDownIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onSelect={() => void onView()}>View</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void onPrint()}>Print</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
