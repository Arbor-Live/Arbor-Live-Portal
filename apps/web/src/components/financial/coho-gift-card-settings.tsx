"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertRecipientList } from "@/components/financial/alert-recipient-list";
import { formatDateTime } from "@/lib/format";
import { notify } from "@/lib/notify";

export function CohoGiftCardSettings() {
  const settings = useQuery(api.cohoGiftCard.getCohoGiftCardSettings, {});
  const save = useMutation(api.cohoGiftCard.updateCohoGiftCardSettings);

  const [localThreshold, setLocalThreshold] = useState<string | null>(null);
  const [localRecipients, setLocalRecipients] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const ready = settings !== undefined;
  const threshold = localThreshold ?? (settings ? String(settings.lowBalanceThresholdUsd) : "");
  const recipients = localRecipients ?? settings?.alertRecipients ?? [];

  async function handleSave() {
    setSaving(true);
    try {
      await save({
        alertRecipients: recipients,
        lowBalanceThresholdUsd: Number(threshold || "0"),
      });
      setLocalThreshold(null);
      setLocalRecipients(null);
      notify.success("CoHo gift card settings saved.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>CoHo gift card</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm">
          {settings?.balanceUsd != null ? (
            <p>
              Current balance: <span className="font-medium">${settings.balanceUsd.toFixed(2)}</span>
            </p>
          ) : (
            <p className="text-muted-foreground">Balance not fetched yet.</p>
          )}
          {settings?.lastCheckedAt ? (
            <p className="text-muted-foreground">
              Last checked {formatDateTime(settings.lastCheckedAt)}
            </p>
          ) : null}
          {settings?.lastError ? (
            <p className="text-destructive">Last refresh failed: {settings.lastError}</p>
          ) : null}
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium" htmlFor="coho-threshold">
            Alert below
          </label>
          <input
            id="coho-threshold"
            type="number"
            min={0}
            step={1}
            className="flex h-9 w-full rounded-md border bg-background px-3 py-1 text-sm"
            value={threshold}
            disabled={!ready}
            onChange={(event) => setLocalThreshold(event.target.value)}
          />
        </div>

        <AlertRecipientList
          label="Alert recipients"
          recipients={recipients}
          onChange={setLocalRecipients}
          disabled={!ready}
        />

        <Button type="button" size="sm" disabled={!ready || saving} onClick={() => void handleSave()}>
          Save CoHo settings
        </Button>
      </CardContent>
    </Card>
  );
}
