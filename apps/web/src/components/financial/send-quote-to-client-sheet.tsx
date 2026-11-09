"use client";

import { getConvexErrorMessage } from "@/lib/convex-error";
import { useState } from "react";
import { useQuery } from "convex/react";
import { SendAsSelect, type SendAs, useSendAs } from "@/components/email-threads/send-as-select";
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

export const DEFAULT_QUOTE_READY_CLIENT_MESSAGE =
  "Thank you for reaching out! Here is the quote I have prepared for you. Please feel free to let me know if you have any questions.";

type SendQuoteToClientSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceId: Id<"invoices"> | undefined;
  toEmail: string;
  /** The quote's manager, as the form has it: who the email can go out as besides you. */
  manager: { userId: string; name: string } | null;
  sending?: boolean;
  onSend: (clientMessage: string, sendAs: SendAs) => Promise<void>;
};

export function SendQuoteToClientSheet({
  open,
  onOpenChange,
  invoiceId,
  toEmail,
  manager,
  sending = false,
  onSend,
}: SendQuoteToClientSheetProps) {
  const { choice, sendAs, setSendAs } = useSendAs(manager);
  const preview = useQuery(
    api.emailThreads.bookingEmailPreview,
    open && invoiceId ? { invoiceId, to: toEmail } : "skip",
  );
  const [message, setMessage] = useState(DEFAULT_QUOTE_READY_CLIENT_MESSAGE);
  const [error, setError] = useState<string | null>(null);

  const trimmed = message.trim();
  const canSend = trimmed.length > 0 && !sending;

  async function handleSend() {
    if (!trimmed) {
      setError("Add a short message for the client before sending.");
      return;
    }
    setError(null);
    try {
      await onSend(trimmed, sendAs);
      onOpenChange(false);
    } catch (err) {
      setError(getConvexErrorMessage(err, "Failed to send quote email."));
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Send quote to client</SheetTitle>
          <SheetDescription>
            Emails the client on their request portal, attaches the quote PDF, and finalizes this
            quote for review.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2">
          <div className="space-y-1.5">
            <Label htmlFor="quote-ready-to">To</Label>
            <Input id="quote-ready-to" readOnly value={toEmail || "—"} />
          </div>

          <SendAsSelect id="quote-ready-send-as" choice={choice} value={sendAs} onChange={setSendAs} />

          <div className="space-y-1.5">
            <p className="text-sm font-medium">Reply-To</p>
            <p className="text-sm text-muted-foreground">{preview?.replyTo ?? "…"}</p>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">CC</p>
            <p data-testid="quote-ready-cc" className="text-sm text-muted-foreground break-words">
              {preview ? preview.cc.join(", ") || "—" : "…"}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quote-ready-subject">Subject</Label>
            <Input id="quote-ready-subject" readOnly value={preview?.subject ?? ""} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quote-ready-message">Your message</Label>
            <Textarea
              id="quote-ready-message"
              className="min-h-32"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={DEFAULT_QUOTE_READY_CLIENT_MESSAGE}
            />
            <p className="text-xs text-muted-foreground">
              Included in the email body. A PDF and request-tracker link are added automatically.
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <SheetFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSend()} disabled={!canSend}>
            {sending ? "Sending…" : "Send email"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
