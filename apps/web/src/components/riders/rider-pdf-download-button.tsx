"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { api, type Id } from "@/lib/convex-api";
import { downloadBytes } from "@/lib/download-bytes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RiderPdfDownloadButton({
  riderId,
  variant = "outline",
  size = "sm",
  className,
  label = "Download PDF",
  loadingLabel = "Preparing PDF…",
}: {
  riderId: Id<"bandRiders">;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
  loadingLabel?: string;
}) {
  const downloadPdf = useAction(api.bandRiderPdfDownload.downloadByRiderId);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function onDownload() {
    setStatus("loading");
    try {
      const result = await downloadPdf({ riderId });
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
        variant={variant}
        size={size}
        disabled={status === "loading"}
        onClick={() => void onDownload()}
      >
        {status === "loading" ? loadingLabel : label}
      </Button>
      {status === "error" ? (
        <span className="text-xs text-destructive">Unable to download PDF.</span>
      ) : null}
    </div>
  );
}
