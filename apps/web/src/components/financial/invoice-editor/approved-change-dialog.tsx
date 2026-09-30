"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api } from "@/lib/convex-api";
import { formatDate, formatUsd } from "@/lib/format";
import { diffQuoteLines, formatUsdDelta } from "@/lib/quote-diff";
import { QuoteChangeList } from "../quote-change-list";
import type { ApprovedChange, InvoiceDraft } from "./use-invoice-draft";

type Decision = ApprovedChange["decision"];

/**
 * A save that changes what the client approved. Shows the change against the
 * approved version and asks what to do: send it back for approval, or keep
 * the approval with a reason. Cancel writes nothing.
 */
export function ApprovedChangeDialog({ draft }: { draft: InvoiceDraft }) {
  const open = draft.approvedChangeOpen;
  return (
    <Dialog open={open} onOpenChange={(next) => draft.setApprovedChangeOpen(next)}>
      <DialogContent className="sm:max-w-xl" data-testid="approved-change-dialog">
        {open ? <ApprovedChangeBody draft={draft} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ApprovedChangeBody({ draft }: { draft: InvoiceDraft }) {
  const [decision, setDecision] = useState<Decision>("request_reapproval");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const payload = draft.buildPayload();
  const preview = useQuery(
    api.invoices.previewApprovedChange,
    draft.activeInvoiceId && payload
      ? {
          id: draft.activeInvoiceId,
          equipmentPricingMode: payload.equipmentPricingMode,
          crewRateMode: payload.crewRateMode,
          discountType: payload.discountType,
          discountValue: payload.discountValue,
          lineItems: payload.lineItems,
        }
      : "skip",
  );

  const keeping = decision === "keep_approval";
  const matching = decision === "match_approval";
  const noteMissing = keeping && !note.trim();

  async function submit() {
    if (noteMissing) return;
    setSubmitting(true);
    const saved = await draft.persistDraft(true, { decision, note: note.trim() || undefined });
    setSubmitting(false);
    if (saved) draft.setApprovedChangeOpen(false);
  }

  const approved = preview?.approved ?? null;
  const proposed = preview?.proposed ?? null;
  const changes = approved && proposed ? diffQuoteLines(approved.lines, proposed.lines) : [];
  // Matching the approval only makes sense when the total went up.
  const increase = approved && proposed ? proposed.totalUsd - approved.totalUsd : 0;
  const canMatch = increase >= 0.005;
  const matchDiscount = approved && proposed ? proposed.subtotalUsd - approved.totalUsd : 0;
  const choiceHelp = matching
    ? `The discount becomes ${formatUsd(matchDiscount)}${
        proposed && proposed.discountAmountUsd > 0 ? ` (was ${formatUsd(proposed.discountAmountUsd)})` : ""
      }, so the total stays ${formatUsd(approved?.totalUsd ?? 0)}. The approval stands, and the client sees the updated lines in their quote history.`
    : keeping
      ? "The approval stands at the new total. The change is logged with your reason and shows in the client's quote history."
      : "The quote goes back to awaiting approval, and the client gets an email showing the old and new totals.";

  return (
    <>
      <DialogHeader>
        <DialogTitle>This quote is approved</DialogTitle>
        <DialogDescription>
          {approved?.approvedBy && approved.approvedAt
            ? `${approved.approvedBy} approved it on ${formatDate(approved.approvedAt)}. `
            : ""}
          Your changes haven&apos;t been saved yet. Choose how the client hears about them.
        </DialogDescription>
      </DialogHeader>

      {preview === undefined ? (
        <Skeleton className="h-24 w-full" />
      ) : approved && proposed ? (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-3 gap-2 border px-3 py-2" data-testid="approved-change-totals">
            <div>
              <dt className="text-xs text-muted-foreground">
                Approved{approved.number ? ` (v${approved.number})` : ""}
              </dt>
              <dd className="font-medium tabular-nums">{formatUsd(approved.totalUsd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">With your changes</dt>
              <dd className="font-medium tabular-nums">{formatUsd(proposed.totalUsd)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Difference</dt>
              <dd className="font-medium tabular-nums">
                {formatUsdDelta(proposed.totalUsd - approved.totalUsd, formatUsd)}
              </dd>
            </div>
          </dl>
          {approved.recordedLate ? (
            <p className="text-xs text-muted-foreground">
              This quote was approved before versions were kept, so &ldquo;approved&rdquo; is the quote as last
              saved.
            </p>
          ) : null}
          <QuoteChangeList changes={changes} />
        </div>
      ) : null}

      <div className="space-y-2">
        <ToggleGroup
          type="single"
          variant="outline"
          orientation="vertical"
          value={decision}
          onValueChange={(value) => {
            if (value) setDecision(value as Decision);
          }}
          aria-label="What happens to the approval"
          className="w-full"
        >
          <ToggleGroupItem value="request_reapproval" className="w-full justify-start">
            Send for re-approval
          </ToggleGroupItem>
          <ToggleGroupItem value="keep_approval" className="w-full justify-start">
            Keep the approval at the new total
          </ToggleGroupItem>
          <ToggleGroupItem
            value="match_approval"
            className="w-full justify-start"
            disabled={!canMatch}
            title={canMatch ? undefined : "Only when the total went up"}
          >
            Update the quote and discount to match the approval
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-xs text-muted-foreground" data-testid="approved-change-help">
          {choiceHelp}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="approved-change-note">
          {keeping ? "Why the approval still stands" : matching ? "Note (optional)" : "Note to the client (optional)"}
        </Label>
        <Textarea
          id="approved-change-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={keeping ? "e.g. Crew hours rounded; the client agreed by email." : "e.g. Added two crew for load-out."}
          rows={2}
        />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => draft.setApprovedChangeOpen(false)}>
          Cancel
        </Button>
        <Button type="button" disabled={submitting || noteMissing || !payload} onClick={() => void submit()}>
          {submitting
            ? "Saving…"
            : keeping
              ? "Save and keep approval"
              : matching
                ? "Save with discount"
                : "Save and send for re-approval"}
        </Button>
      </DialogFooter>
    </>
  );
}
