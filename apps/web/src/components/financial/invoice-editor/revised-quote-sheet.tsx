"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { QuoteChangeList } from "@/components/financial/quote-change-list";
import { ARBOR_CONTACT_EMAIL } from "@/components/financial/send-quote-to-client-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { formatUsd } from "@/lib/format";
import { diffQuoteLines, formatUsdDelta } from "@/lib/quote-diff";

/**
 * Answer the client's change request: their request, what changed in the
 * quote since they asked, and a reply. Sending records a new version after
 * the request, so both stay in the history.
 */
export function RevisedQuoteSheet({
  open,
  onOpenChange,
  invoiceId,
  toEmail,
  managerEmail,
  isRequestLinked,
  hasUnsavedEdits,
  sending,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: Id<"invoices">;
  toEmail: string;
  managerEmail?: string;
  isRequestLinked: boolean;
  hasUnsavedEdits: boolean;
  sending: boolean;
  onSend: (message: string) => Promise<void>;
}) {
  const preview = useQuery(api.invoices.revisedQuotePreview, open ? { id: invoiceId } : "skip");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const trimmed = message.trim();

  const request = preview?.request;
  const changes = request?.lines && preview ? diffQuoteLines(request.lines, preview.current.lines) : null;
  const delta = request?.totalUsd != null && preview ? preview.current.totalUsd - request.totalUsd : null;
  const unchanged = changes !== null && changes.length === 0 && (delta === null || Math.abs(delta) < 0.005);

  const replyTo = [managerEmail?.trim() || null, ARBOR_CONTACT_EMAIL].filter(
    (value, index, all): value is string =>
      Boolean(value) && all.findIndex((entry) => entry?.toLowerCase() === value?.toLowerCase()) === index,
  );

  async function handleSend() {
    if (!trimmed) {
      setError(unchanged ? "Tell the client why the quote stays as it is." : "Tell the client what changed.");
      return;
    }
    setError(null);
    try {
      await onSend(trimmed);
      onOpenChange(false);
    } catch (err) {
      setError(getConvexErrorMessage(err, "Could not send the revised quote."));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md" data-testid="revised-quote-sheet">
        <SheetHeader>
          <SheetTitle>Reply to the change request</SheetTitle>
          <SheetDescription>
            Sends the quote as it stands with your reply, and asks the client to approve it again.{" "}
            {isRequestLinked
              ? "It goes back on their request portal with the quote PDF."
              : "They get an email with their quote link."}{" "}
            Their request stays in the version history.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
          <div className="space-y-1.5">
            <p className="text-sm font-medium">They asked</p>
            <p className="border-l-2 border-status-amber-500/60 pl-2 text-sm whitespace-pre-line wrap-anywhere">
              {request?.note ? `“${request.note}”` : "—"}
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">What changed since</p>
            {preview === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : changes === null ? (
              <p className="text-sm text-muted-foreground">
                This request came in before versions were kept, so there&apos;s nothing to compare against.
              </p>
            ) : unchanged ? (
              <p className="text-sm text-status-amber-700 dark:text-status-amber-300" data-testid="revised-quote-unchanged">
                Nothing yet: you&apos;ll resend the same quote ({formatUsd(preview?.current.totalUsd ?? 0)}). Say why
                in your reply, or make the changes first.
              </p>
            ) : (
              <>
                <p className="text-sm tabular-nums">
                  {formatUsd(request?.totalUsd ?? 0)} → {formatUsd(preview?.current.totalUsd ?? 0)}
                  {delta !== null ? (
                    <span className="text-muted-foreground"> ({formatUsdDelta(delta, formatUsd)})</span>
                  ) : null}
                </p>
                <QuoteChangeList changes={changes} />
              </>
            )}
            {hasUnsavedEdits ? (
              <p className="text-xs text-muted-foreground">Your unsaved edits are saved and included when you send.</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="revised-quote-to">To</Label>
            <Input id="revised-quote-to" readOnly value={toEmail || "No client email on file"} />
            <p className="text-xs text-muted-foreground">Reply-To: {replyTo.join(" · ")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="revised-quote-message">Your reply</Label>
            <Textarea
              id="revised-quote-message"
              data-testid="revised-quote-message"
              className="min-h-32"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={
                unchanged
                  ? "Why the quote stays as it is"
                  : "What you changed, e.g. Removed the second photographer and trimmed setup by an hour."
              }
            />
            <p className="text-xs text-muted-foreground">
              Shown to the client with this version, and included in the email.
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button
            type="button"
            data-testid="revised-quote-send"
            onClick={() => void handleSend()}
            disabled={!trimmed || sending}
          >
            {sending ? "Sending…" : unchanged ? "Resend unchanged" : "Send revised quote"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
