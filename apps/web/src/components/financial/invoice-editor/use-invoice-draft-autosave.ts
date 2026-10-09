"use client";

import { useEffect } from "react";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { useNavigationGuard } from "@/hooks/use-navigation-guard";

type AutosaveInvoiceData = {
  invoice: {
    status: string;
    clientApprovalStatus?: string | null;
    clientReviewReadyAt?: number | null;
  };
};

export function useInvoiceDraftAutosave({
  invoiceData,
  persistDraft,
  draftSignature,
  activeInvoiceId,
  invoiceFieldsHydrated,
  editorBaselineReady,
  isDraftDirty,
  saving,
  saveStatus,
}: {
  invoiceData: AutosaveInvoiceData | null | undefined;
  persistDraft: () => Promise<boolean>;
  draftSignature: string;
  activeInvoiceId: string | undefined;
  invoiceFieldsHydrated: boolean;
  editorBaselineReady: boolean;
  isDraftDirty: boolean;
  saving: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
}) {
  // Autosave only while the quote is an unsent draft. Once the client can see
  // it (sent, or approved), every change is an explicit save.
  const invoiceDoc = invoiceData?.invoice;
  const autosaveEnabled = Boolean(
    invoiceDoc &&
      invoiceDoc.status === "draft" &&
      (invoiceDoc.clientApprovalStatus ?? "pending") !== "approved" &&
      !invoiceDoc.clientReviewReadyAt,
  );

  useEffect(() => {
    if (!autosaveEnabled) return;
    if (!activeInvoiceId || !invoiceFieldsHydrated || !editorBaselineReady || !isDraftDirty) return;
    if (saving || saveStatus === "saving") return;
    const timer = window.setTimeout(() => {
      void persistDraft();
    }, 2500);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persistDraft is recreated each render; draftSignature covers content changes
  }, [draftSignature, autosaveEnabled, activeInvoiceId, invoiceFieldsHydrated, editorBaselineReady, isDraftDirty, saving, saveStatus]);

  // Warn on unload while anything is unsaved, including a draft whose
  // autosave is still debouncing: leaving now would drop that save.
  useBeforeUnload(isDraftDirty, "You have unsaved changes to this quote.");
  useNavigationGuard(isDraftDirty, "Discard unsaved changes to this quote?");

  return { autosaveEnabled };
}
