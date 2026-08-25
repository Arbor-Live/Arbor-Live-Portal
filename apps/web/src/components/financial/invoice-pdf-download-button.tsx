"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { FilePdfIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { downloadBytes } from "@/lib/download-bytes";
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
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function onDownload() {
    setStatus("loading");
    try {
      const bytes = await downloadPdf({
        invoiceId,
        siteOrigin: typeof window !== "undefined" ? window.location.origin : undefined,
      });
      downloadBytes(bytes, `${invoiceNumber ?? invoiceId}.pdf`);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  // Prefer icon-sm so icon buttons match size="sm" text buttons (h-7).
  const buttonSize = iconOnly ? (size === "icon" || size === "icon-sm" ? size : "icon-sm") : size;
  const title = status === "loading" ? loadingLabel : label;

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Button
        type="button"
        variant={variant}
        size={buttonSize}
        disabled={status === "loading"}
        onClick={() => void onDownload()}
        title={title}
        aria-label={title}
      >
        {iconOnly ? (
          <FilePdfIcon className="size-3.5" />
        ) : status === "loading" ? (
          loadingLabel
        ) : (
          label
        )}
      </Button>
      {status === "error" ? (
        <span className="text-sm text-destructive">Unable to download PDF. Please try again.</span>
      ) : null}
    </div>
  );
}
