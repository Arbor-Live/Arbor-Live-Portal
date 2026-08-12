"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { api, type Id } from "@/lib/convex-api";
import { downloadBytes } from "@/lib/download-bytes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function EventShowFileDownloadButton({
  eventId,
  disabled = false,
  className,
}: {
  eventId: Id<"events">;
  disabled?: boolean;
  className?: string;
}) {
  const download = useAction(api.eventShowFileDownload.downloadByEventId);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function onDownload() {
    setStatus("loading");
    try {
      const result = await download({ eventId });
      downloadBytes(result.bytes, result.fileName, "application/zip");
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className={cn("inline-flex flex-col gap-1", className)}>
      <Button
        type="button"
        size="sm"
        variant="default"
        disabled={disabled || status === "loading"}
        onClick={() => void onDownload()}
      >
        {status === "loading" ? "Preparing show file…" : "Download show file"}
      </Button>
      {status === "error" ? (
        <p className="text-xs text-destructive">Couldn’t build the show file.</p>
      ) : null}
    </div>
  );
}
