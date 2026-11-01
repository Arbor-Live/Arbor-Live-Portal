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
 * Send the client a new version: a reply to their change request, or a
 * revision staff make on their own. Shows what changed since the request or
 * the last version sent, and takes the message that goes with it.
 */
export function RevisedQuoteSheet({
  open,
  onOpenChange,
  invoiceId,
  isReply,
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
  /** Answering the client's open change request, rather than revising on our own. */
  isReply: boolean;
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

  const basis = preview?.basis;
  const changes = basis?.lines && preview ? diffQuoteLines(basis.lines, preview.current.lines) : null;
  const delta = basis?.totalUsd != null && preview ? preview.current.totalUsd - basis.totalUsd : null;
  const unchanged = changes !== null && changes.length === 0 && (delta === null || Math.abs(delta) < 0.005);

  const replyTo = [managerEmail?.trim() || null, ARBOR_CONTACT_EMAIL].filter(
    (value, index, all): value is string =>
      Boolean(value) && all.findIndex((entry) => entry?.toLowerCase() === value?.toLowerCase()) === index,
  );

  async function handleSend() {
    if (!trimmed) {
      setError(
        unchanged
          ? isReply
            ? "Tell the client why the quote stays as it is."
            : "Tell the client why you're resending it."
          : "Tell the client what changed.",
      );
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
          <SheetTitle>{isReply ? "Reply to the change request" : "Send a revised quote"}</SheetTitle>
          <SheetDescription>
            Sends the quote as it stands with your {isReply ? "reply" : "message"}, as a new version for the
            client to approve.{" "}
            {isRequestLinked
              ? "It goes back on their request portal with the quote PDF."
              : "They get an email with their quote link."}{" "}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
          {isReply ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">They asked</p>
              <p className="border-l-2 border-status-amber-500/60 pl-2 text-sm whitespace-pre-line wrap-anywhere">
                {basis?.note ? `“${basis.note}”` : "—"}
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <p className="text-sm font-medium">
              What changed since{!isReply && basis?.number ? ` v${basis.number}` : ""}
            </p>
            {preview === undefined ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : changes === null ? (
              <p className="text-sm text-muted-foreground">
                {isReply
                  ? "This request came in before versions were kept, so there's nothing to compare against."
                  : "The client hasn't been sent a version yet, so there's nothing to compare against."}
              </p>
            ) : unchanged ? (
              <p className="text-sm text-status-amber-700 dark:text-status-amber-300" data-testid="revised-quote-unchanged">
                Nothing yet: you&apos;ll resend the same quote ({formatUsd(preview?.current.totalUsd ?? 0)}). Say why
                in your {isReply ? "reply" : "message"}, or make the changes first.
              </p>
            ) : (
              <>
                <p className="text-sm tabular-nums">
                  {formatUsd(basis?.totalUsd ?? 0)} → {formatUsd(preview?.current.totalUsd ?? 0)}
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
            <Label htmlFor="revised-quote-message">{isReply ? "Your reply" : "Your message"}</Label>
            <Textarea
              id="revised-quote-message"
              data-testid="revised-quote-message"
              className="min-h-32"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={
                unchanged
                  ? isReply
                    ? "Why the quote stays as it is"
                    : "Why you're resending it"
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
