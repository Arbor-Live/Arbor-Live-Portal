"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { api, type Id } from "@/lib/convex-api";
import { downloadBytes } from "@/lib/download-bytes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Always-available event brief. Unlike the night rider, this renders for every
 * event — band input/changeover pages are appended only when bands have riders.
 */
export function EventBriefDownloadButton({
  eventId,
  className,
}: {
  eventId: Id<"events">;
  className?: string;
}) {
  const download = useAction(api.eventBriefDownload.downloadBriefByEventId);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function onDownload() {
    setStatus("loading");
    try {
      const result = await download({ eventId });
      downloadBytes(result.bytes, result.fileName);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        disabled={status === "loading"}
        onClick={() => void onDownload()}
      >
        {status === "loading" ? "Preparing brief…" : "Download brief"}
      </Button>
      {status === "error" ? (
        <p className="text-xs text-destructive">Couldn’t build the brief.</p>
      ) : null}
    </div>
  );
}
