"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type DeletePreview = {
  label: string;
  linkedQuote?: { id: string; number: string };
  linkedRequest?: { id: string; number: string };
  linkedEvents: Array<{ id: string; title: string }>;
};

export function AdminCascadeDeleteDialog({
  open,
  onClose,
  entityName,
  preview,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  entityName: string;
  preview: DeletePreview | null | undefined;
  onConfirm: (cascade: boolean) => Promise<void>;
}) {
  if (!open) return null;

  return (
    <AdminCascadeDeleteDialogBody
      key={preview?.label ?? "loading"}
      onClose={onClose}
      entityName={entityName}
      preview={preview}
      onConfirm={onConfirm}
    />
  );
}

function AdminCascadeDeleteDialogBody({
  onClose,
  entityName,
  preview,
  onConfirm,
}: {
  onClose: () => void;
  entityName: string;
  preview: DeletePreview | null | undefined;
  onConfirm: (cascade: boolean) => Promise<void>;
}) {
  const hasLinkedQuote = Boolean(preview?.linkedQuote);
  const hasLinkedRequest = Boolean(preview?.linkedRequest);
  const hasLinkedEvents = (preview?.linkedEvents.length ?? 0) > 0;
  const hasLinkedRecords = hasLinkedQuote || hasLinkedRequest || hasLinkedEvents;

  const [cascade, setCascade] = useState(hasLinkedRecords);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setSaving(true);
    setError(null);
    try {
      await onConfirm(cascade);
      onClose();
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Delete {entityName}?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This permanently removes <span className="font-medium text-foreground">{preview?.label}</span>.
            This cannot be undone.
          </p>

          {hasLinkedRecords ? (
            <div className="space-y-3 rounded-md border p-3 text-sm">
              <p className="font-medium">Linked records</p>
              <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                {preview?.linkedQuote ? <li>Quote {preview.linkedQuote.number}</li> : null}
                {preview?.linkedRequest ? <li>Request {preview.linkedRequest.number}</li> : null}
                {preview?.linkedEvents.map((event) => (
                  <li key={event.id}>Event: {event.title}</li>
                ))}
              </ul>

              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={cascade}
                  onChange={(event) => setCascade(event.target.checked)}
                />
                <span>
                  <Label className="text-sm font-medium">Also delete linked records</Label>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {cascade
                      ? "The linked quote, request, and event(s) above will be deleted too."
                      : "Only this record is deleted. Linked quote, request, and events are kept but unlinked."}
                  </span>
                </span>
              </label>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No linked quote, request, or event records.</p>
          )}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" disabled={saving} onClick={() => void handleConfirm()}>
              {saving ? "Deleting..." : cascade && hasLinkedRecords ? "Delete all" : "Delete"}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
