"use client";

import { useAction } from "convex/react";
import { useState } from "react";
import { downloadBytes } from "@/lib/download-bytes";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
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
  const [loading, setLoading] = useState(false);

  async function onDownload() {
    setLoading(true);
    try {
      const bytes =
        portal === "quote"
          ? await downloadQuote({ token })
          : await downloadRequest({ token });
      downloadBytes(bytes, `${invoiceNumber}.pdf`);
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Unable to download PDF. Please try again."));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" disabled={loading} onClick={() => void onDownload()}>
      {loading ? "Preparing PDF…" : "Download invoice PDF"}
    </Button>
  );
}
