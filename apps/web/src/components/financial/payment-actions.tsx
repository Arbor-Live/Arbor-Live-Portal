"use client";

import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { optimisticMarkPaymentReceived } from "@/lib/payment-proof-optimistic";
import { compressImageToLimit } from "@/lib/image-processing";

type InvalidateTarget = { submissionId: Id<"eventPaymentProofSubmissions">; invoiceNumber: string };

/**
 * The payment actions an invoice can take from a list or its side panel: mark
 * the payment received, invalidate submitted proof (with a required reason),
 * and attach or replace the receipt. Render `elements` once on the page; it
 * holds the shared file input and the invalidate dialog.
 */
export function usePaymentActions() {
  const markReceivedMutation = useMutation(api.paymentProof.markPaymentReceived).withOptimisticUpdate(
    optimisticMarkPaymentReceived,
  );
  const invalidateSubmission = useMutation(api.paymentProof.invalidateSubmission);
  const generateUploadUrl = useMutation(api.paymentProof.generateReceiptUploadUrl);
  const attachReceipt = useMutation(api.paymentProof.attachReceipt);

  const [busyInvoiceId, setBusyInvoiceId] = useState<Id<"invoices"> | null>(null);
  const [invalidating, setInvalidating] = useState<InvalidateTarget | null>(null);
  const [note, setNote] = useState("");
  const [invalidateBusy, setInvalidateBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInvoiceIdRef = useRef<Id<"invoices"> | null>(null);

  async function markReceived(invoiceId: Id<"invoices">, invoiceNumber: string) {
    setBusyInvoiceId(invoiceId);
    try {
      await markReceivedMutation({ invoiceId });
      notify.success(`Marked ${invoiceNumber} paid.`);
      return true;
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not mark the payment received."));
      return false;
    } finally {
      setBusyInvoiceId(null);
    }
  }

  function requestInvalidate(target: InvalidateTarget) {
    setNote("");
    setInvalidating(target);
  }

  async function confirmInvalidate() {
    if (!invalidating) return;
    setInvalidateBusy(true);
    try {
      await invalidateSubmission({ submissionId: invalidating.submissionId, note });
      notify.success(`Invalidated the proof on ${invalidating.invoiceNumber}. The client can submit new proof.`);
      setInvalidating(null);
    } catch (error) {
      // Keep the dialog open so the reason can be fixed.
      notify.error(getConvexErrorMessage(error, "Could not invalidate the proof."));
    } finally {
      setInvalidateBusy(false);
    }
  }

  function pickReceipt(invoiceId: Id<"invoices">) {
    uploadInvoiceIdRef.current = invoiceId;
    fileInputRef.current?.click();
  }

  async function uploadReceipt(invoiceId: Id<"invoices">, file: File) {
    setBusyInvoiceId(invoiceId);
    try {
      const preparedFile = await compressImageToLimit(file);
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": preparedFile.type || "application/octet-stream" },
        body: preparedFile,
      });
      if (!response.ok) throw new Error("Upload failed");
      const { storageId } = (await response.json()) as { storageId: Id<"_storage"> };
      await attachReceipt({ invoiceId, storageFileId: storageId });
      notify.success("Receipt attached.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Could not attach the receipt."));
    } finally {
      setBusyInvoiceId(null);
      uploadInvoiceIdRef.current = null;
    }
  }

  const elements = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/*"
        data-testid="receipt-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          const invoiceId = uploadInvoiceIdRef.current;
          if (file && invoiceId) void uploadReceipt(invoiceId, file);
          event.target.value = "";
        }}
      />
      <Dialog
        open={invalidating !== null}
        onOpenChange={(open) => {
          if (!open) setInvalidating(null);
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          data-testid="invalidate-proof-dialog"
        >
          <DialogHeader>
            <DialogTitle>Invalidate payment proof</DialogTitle>
            <DialogDescription>
              {invalidating
                ? `The proof on ${invalidating.invoiceNumber} stops counting, and the client can submit new proof from their portal.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="invalidate-proof-note">Reason (the client sees this)</Label>
            <Textarea
              id="invalidate-proof-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Reason for invalidation (required)"
            />
            {!note.trim() ? (
              <p className="text-xs text-muted-foreground">A reason is required.</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setInvalidating(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={invalidateBusy || !note.trim()}
              onClick={() => void confirmInvalidate()}
            >
              Invalidate proof
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  return { busyInvoiceId, markReceived, requestInvalidate, pickReceipt, elements };
}

export type PaymentActions = ReturnType<typeof usePaymentActions>;
