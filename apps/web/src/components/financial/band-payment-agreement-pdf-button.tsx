"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { downloadBytes } from "@/lib/download-bytes";
import { notify } from "@/lib/notify";
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
  const [loading, setLoading] = useState(false);

  async function onDownload() {
    setLoading(true);
    try {
      const result = await downloadPdf({ paymentId });
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
