"use client";

import { useState } from "react";
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

export const DEFAULT_QUOTE_READY_CLIENT_MESSAGE =
  "Thank you for reaching out! Here is the quote I have prepared for you. Please feel free to let me know if you have any questions.";

export const ARBOR_CONTACT_EMAIL = "arborlive@stanford.edu";

type SendQuoteToClientSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toEmail: string;
  managerEmail?: string;
  subjectPreview: string;
  sending?: boolean;
  onSend: (clientMessage: string) => Promise<void>;
};

export function SendQuoteToClientSheet({
  open,
  onOpenChange,
  toEmail,
  managerEmail,
  subjectPreview,
  sending = false,
  onSend,
}: SendQuoteToClientSheetProps) {
  const [message, setMessage] = useState(DEFAULT_QUOTE_READY_CLIENT_MESSAGE);
  const [error, setError] = useState<string | null>(null);

  const trimmed = message.trim();
  const canSend = trimmed.length > 0 && !sending;

  const replyToParts = [
    managerEmail?.trim() || null,
    ARBOR_CONTACT_EMAIL,
  ].filter((value, index, all): value is string => {
    if (!value) return false;
    return all.findIndex((entry) => entry?.toLowerCase() === value.toLowerCase()) === index;
  });

  async function handleSend() {
    if (!trimmed) {
      setError("Add a short message for the client before sending.");
      return;
    }
    setError(null);
    try {
      await onSend(trimmed);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send quote email.");
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

          <div className="space-y-1.5">
            <Label>Reply-To</Label>
            <p className="text-sm text-muted-foreground">{replyToParts.join(" · ")}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quote-ready-subject">Subject</Label>
            <Input id="quote-ready-subject" readOnly value={subjectPreview} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quote-ready-message">Your message</Label>
            <textarea
              id="quote-ready-message"
              className="min-h-32 w-full rounded-md border bg-background px-3 py-2 text-sm"
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
