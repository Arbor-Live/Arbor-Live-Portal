"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MarkdownContent } from "@/components/markdown-content";

export function PublicQuoteTermsApproval({
  termsAndConditionsMarkdown,
  termsVersion,
  acceptTerms,
  setAcceptTerms,
  locked,
  saving,
  onApprove,
  note,
  setNote,
  onRequestChanges,
}: {
  termsAndConditionsMarkdown: string;
  termsVersion: string;
  acceptTerms: boolean;
  setAcceptTerms: (value: boolean) => void;
  locked: boolean;
  saving: boolean;
  onApprove: () => Promise<void>;
  note: string;
  setNote: (value: string) => void;
  onRequestChanges: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Terms & Conditions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <MarkdownContent>{termsAndConditionsMarkdown || "_No terms configured._"}</MarkdownContent>
          <div className="flex items-center gap-2">
            <input
              id="accept-terms"
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => setAcceptTerms(e.target.checked)}
              disabled={locked}
            />
            <Label htmlFor="accept-terms">I accept the terms and conditions (version {termsVersion}).</Label>
          </div>
          <Button type="button" disabled={locked || !acceptTerms || saving} onClick={() => void onApprove()}>
            Approve Quote
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request Changes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <textarea
            className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Tell us what changes are needed"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={locked}
          />
          <Button
            type="button"
            variant="outline"
            disabled={locked || !note.trim() || saving}
            onClick={() => void onRequestChanges()}
          >
            Request Changes
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
