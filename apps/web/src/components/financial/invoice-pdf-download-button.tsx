"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { FilePdfIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { downloadBytes } from "@/lib/download-bytes";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function InvoicePdfDownloadButton({
  invoiceId,
  invoiceNumber,
  variant = "outline",
  size = "default",
  className,
  label = "Download PDF",
  loadingLabel = "Preparing PDF…",
  iconOnly = false,
}: {
  invoiceId: Id<"invoices">;
  invoiceNumber?: string;
  variant?: "default" | "outline" | "ghost" | "secondary" | "destructive" | "link";
  size?: "default" | "sm" | "lg" | "icon" | "icon-sm";
  className?: string;
  label?: string;
  loadingLabel?: string;
  iconOnly?: boolean;
}) {
  const downloadPdf = useAction(api.invoicePdfDownload.downloadByInvoiceId);
  const [loading, setLoading] = useState(false);

  async function onDownload() {
    setLoading(true);
    try {
      const bytes = await downloadPdf({
        invoiceId,
        siteOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      downloadBytes(bytes, `${invoiceNumber ?? invoiceId}.pdf`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Unable to download PDF. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  // Prefer icon-sm so icon buttons match size="sm" text buttons (h-7).
  const buttonSize = iconOnly ? (size === "icon" || size === "icon-sm" ? size : "icon-sm") : size;
  const title = loading ? loadingLabel : label;

  return (
    <Button
      type="button"
      variant={variant}
      size={buttonSize}
      className={cn(className)}
      disabled={loading}
      onClick={() => void onDownload()}
      title={title}
      aria-label={title}
    >
      {iconOnly ? (
        <FilePdfIcon className="size-3.5" />
      ) : loading ? (
        loadingLabel
      ) : (
        label
      )}
    </Button>
  );
}
