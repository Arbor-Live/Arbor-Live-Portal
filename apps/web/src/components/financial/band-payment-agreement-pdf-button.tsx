"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { api, type Id } from "@/lib/convex-api";
import { downloadBytes } from "@/lib/download-bytes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function BandPaymentAgreementPdfButton({
  paymentId,
  variant = "outline",
  size = "sm",
  className,
  label = "Download agreement PDF",
  loadingLabel = "Preparing PDF…",
}: {
  paymentId: Id<"eventBandPayments">;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  label?: string;
  loadingLabel?: string;
}) {
  const downloadPdf = useAction(api.bandPaymentPdfDownload.downloadByPaymentId);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function onDownload() {
    setStatus("loading");
    try {
      const result = await downloadPdf({ paymentId });
      downloadBytes(result.bytes, result.fileName);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="inline-flex flex-col gap-1">
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn(className)}
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
