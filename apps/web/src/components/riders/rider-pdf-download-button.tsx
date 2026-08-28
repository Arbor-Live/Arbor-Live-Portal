"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { downloadBytes } from "@/lib/download-bytes";
import { notify } from "@/lib/notify";
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
  const [loading, setLoading] = useState(false);

  async function onDownload() {
    setLoading(true);
    try {
      const result = await downloadPdf({ riderId });
      downloadBytes(result.bytes, result.fileName);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Unable to download PDF. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn(className)}
      disabled={loading}
      onClick={() => void onDownload()}
    >
      {loading ? loadingLabel : label}
    </Button>
  );
}
