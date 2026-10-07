"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppDialog } from "@/components/ui/app-dialog";
import { AlertRecipientList } from "@/components/financial/alert-recipient-list";
import { formatDateTime, formatUsd } from "@/lib/format";
import { notify } from "@/lib/notify";

export function CohoGiftCardSettings() {
  const settings = useQuery(api.cohoGiftCard.getCohoGiftCardSettings, {});
  const save = useMutation(api.cohoGiftCard.updateCohoGiftCardSettings);
  const addCard = useMutation(api.cohoGiftCard.addCohoGiftCard);

  const [localThreshold, setLocalThreshold] = useState<string | null>(null);
  const [localRecipients, setLocalRecipients] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newToken, setNewToken] = useState("");
  const [addingCard, setAddingCard] = useState(false);

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

  async function handleAddCard() {
    if (!newLabel.trim() || !newToken.trim()) return;
    setAddingCard(true);
    try {
      await addCard({ label: newLabel, secureToken: newToken });
      setNewLabel("");
      setNewToken("");
      notify.success("Card added — fetching its balance now.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to add card.");
    } finally {
      setAddingCard(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>CoHo gift card</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1">
          <Label htmlFor="coho-threshold">Alert below</Label>
          <Input
            id="coho-threshold"
            type="number"
            min={0}
            step={1}
            value={threshold}
            disabled={!ready || saving}
            onChange={(event) => setLocalThreshold(event.target.value)}
          />
        </div>

        <AlertRecipientList
          label="Alert recipients"
          recipients={recipients}
          onChange={setLocalRecipients}
          disabled={!ready || saving}
        />

        <Button type="button" size="sm" disabled={!ready || saving} onClick={() => void handleSave()}>
          Save CoHo settings
        </Button>

        <div className="space-y-2 border-t pt-4">
          <p className="text-sm font-medium">Cards</p>
          {settings && settings.cards.length > 0 ? (
            settings.cards.map((card) => <CardRow key={card._id} card={card} />)
          ) : (
            <p className="text-sm text-muted-foreground">No cards yet.</p>
          )}

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-sm font-medium">Add card</p>
            <Input
              placeholder="Card name (e.g. CoHo main)"
              value={newLabel}
              disabled={!ready || addingCard}
              onChange={(event) => setNewLabel(event.target.value)}
            />
            <Input
              type="password"
              placeholder="Toast token"
              value={newToken}
              disabled={!ready || addingCard}
              onChange={(event) => setNewToken(event.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!ready || addingCard || !newLabel.trim() || !newToken.trim()}
              onClick={() => void handleAddCard()}
            >
              Add card
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CardRow({
  card,
}: {
  card: {
    _id: Id<"cohoGiftCards">;
    label: string;
    cardNumber: string | null;
    balanceUsd: number | null;
    lastCheckedAt: number | null;
    lastError: string | null;
  };
}) {
  const replaceToken = useMutation(api.cohoGiftCard.replaceCohoGiftCardToken);
  const removeCard = useMutation(api.cohoGiftCard.removeCohoGiftCard);
  const { confirm } = useAppDialog();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleReplace() {
    if (!token.trim()) return;
    setBusy(true);
    try {
      await replaceToken({ cardId: card._id, secureToken: token });
      setToken("");
      notify.success("Token replaced — refreshing now.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to replace token.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    const ok = await confirm({
      title: `Remove "${card.label}"?`,
      description: "Crew will no longer be able to use this card, and it stops being checked.",
      destructive: true,
      confirmLabel: "Remove card",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeCard({ cardId: card._id });
      notify.success("Card removed.");
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Failed to remove card.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{card.label}</p>
          <p className="text-xs text-muted-foreground">
            {card.balanceUsd != null ? formatUsd(card.balanceUsd) : "Balance not fetched yet"}
            {card.cardNumber ? ` · ${card.cardNumber}` : ""}
          </p>
          {card.lastCheckedAt ? (
            <p className="text-xs text-muted-foreground">
              Last checked {formatDateTime(card.lastCheckedAt)}
            </p>
          ) : null}
          {card.lastError ? (
            <p className="text-xs text-destructive">Last refresh failed: {card.lastError}</p>
          ) : null}
        </div>
        <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void handleRemove()}>
          Remove
        </Button>
      </div>
      <div className="flex gap-2">
        <Input
          type="password"
          placeholder="Replace token…"
          value={token}
          disabled={busy}
          onChange={(event) => setToken(event.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={busy || !token.trim()}
          onClick={() => void handleReplace()}
        >
          Replace token
        </Button>
      </div>
    </div>
  );
}
