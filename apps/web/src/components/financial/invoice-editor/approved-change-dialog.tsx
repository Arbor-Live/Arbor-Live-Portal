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
 * approved version and asks what to do: send it back for approval, keep the
 * approval with a reason, or set the discount so the total matches the
 * approval. When the total fell and the quote already has a discount (final
 * crew came in cheaper), it suggests lowering that discount. Cancel writes
 * nothing.
 */
export function ApprovedChangeDialog({ draft }: { draft: InvoiceDraft }) {
  const open = draft.approvedChangeOpen;
  return (
    <Dialog open={open} onOpenChange={(next) => draft.setApprovedChangeOpen(next)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl" data-testid="approved-change-dialog">
        {open ? <ApprovedChangeBody draft={draft} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ApprovedChangeBody({ draft }: { draft: InvoiceDraft }) {
  const [decision, setDecision] = useState<Decision>("request_reapproval");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [suggestionDismissed, setSuggestionDismissed] = useState(false);
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
    // The preview can refetch after the choice is made; never send a match the server will refuse.
    if (noteMissing || matchUnavailable) return;
    setSubmitting(true);
    const saved = await draft.persistDraft(true, { decision, note: note.trim() || undefined });
    setSubmitting(false);
    if (saved) draft.setApprovedChangeOpen(false);
  }

  const approved = preview?.approved ?? null;
  const proposed = preview?.proposed ?? null;
  const changes = approved && proposed ? diffQuoteLines(approved.lines, proposed.lines) : [];
  // Raise the discount when the total went up; lower an existing one when it
  // went down. Not offered when there's nothing to match.
  const match = preview?.discountMatch ?? null;
  const canMatch = match !== null;
  const lowering = match?.kind === "lower";
  const matchUnavailable = matching && !canMatch;
  const approvedTotal = formatUsd(approved?.totalUsd ?? 0);
  const matchOutcome = !match
    ? ""
    : match.reachesApproved
      ? `so the total stays ${approvedTotal}`
      : `so the total is ${formatUsd(match.totalUsd)}, still ${formatUsd((approved?.totalUsd ?? 0) - match.totalUsd)} under the approved ${approvedTotal}`;
  const showSuggestion = lowering && !matching && !suggestionDismissed && approved !== null;
  const choiceHelp = matchUnavailable
    ? "The total didn't go up and there's no discount to lower, so there's nothing to match. Choose another option."
    : matching && match
    ? `${
        lowering
          ? `The discount goes from ${formatUsd(match.fromUsd)} to ${formatUsd(match.toUsd)}`
          : `The discount becomes ${formatUsd(match.toUsd)}${match.fromUsd > 0 ? ` (was ${formatUsd(match.fromUsd)})` : ""}`
      }, ${matchOutcome}. The approval stands, and the client sees the updated lines in their quote history.`
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

      {showSuggestion && match ? (
        <div className="space-y-2 border border-primary/40 bg-primary/5 px-3 py-2" data-testid="approved-discount-suggestion">
          <p className="text-sm font-medium">
            Discount {formatUsd(match.fromUsd)} → {formatUsd(match.toUsd)}{" "}
            {match.reachesApproved
              ? `keeps the total at the approved ${approvedTotal}`
              : `brings the total to ${formatUsd(match.totalUsd)}`}
          </p>
          <p className="text-xs text-muted-foreground">
            {match.reachesApproved
              ? "The quote came in under what the client approved. Lowering the discount keeps their total the same, and their approval stands."
              : `The quote came in under the approved ${approvedTotal} by more than the discount, so removing it is as close as the discount can get.`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setDecision("match_approval")}>
              {match.toUsd > 0 ? `Lower to ${formatUsd(match.toUsd)}` : "Remove the discount"}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setSuggestionDismissed(true)}>
              Keep {formatUsd(match.fromUsd)}
            </Button>
          </div>
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
            title={canMatch ? undefined : "Only when the total went up, or went down with a discount to lower"}
          >
            {lowering ? "Lower the discount to match the approval" : "Update the quote and discount to match the approval"}
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
        <Button type="button" disabled={submitting || noteMissing || matchUnavailable || !payload} onClick={() => void submit()}>
          {submitting
            ? "Saving…"
            : keeping
              ? "Save and keep approval"
              : matching
                ? lowering
                  ? "Save with lower discount"
                  : "Save with discount"
                : "Save and send for re-approval"}
        </Button>
      </DialogFooter>
    </>
  );
}
