"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { downloadBytes } from "@/lib/download-bytes";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";

export function PublicInvoicePdfDownload({
  token,
  portal,
  invoiceNumber,
}: {
  token: string;
  portal: "quote" | "request";
  invoiceNumber: string;
}) {
  const downloadQuote = useAction(api.paymentProofPublic.downloadInvoicePdfByQuoteToken);
  const downloadRequest = useAction(api.paymentProofPublic.downloadInvoicePdfByRequestToken);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  async function onDownload() {
    setStatus("loading");
    try {
      const bytes =
        portal === "quote"
          ? await downloadQuote({ token })
          : await downloadRequest({ token });
      downloadBytes(bytes, `${invoiceNumber}.pdf`);
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" size="sm" disabled={status === "loading"} onClick={onDownload}>
        {status === "loading" ? "Preparing PDF…" : "Download invoice PDF"}
      </Button>
      {status === "error" ? (
        <span className="text-sm text-destructive">Unable to download PDF. Please try again.</span>
      ) : null}
    </div>
  );
}
