"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { normalizeAssetScanInput } from "@/lib/asset-scan";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  RETIREMENT_REASON_ORDER,
  RETIREMENT_REASONS,
  type RetirementReason,
} from "@/lib/inventory-lifecycle";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { InventoryItemSearchSelect } from "./inventory-search-select";
import { ScanInput } from "./scan-input";

export type LifecycleTarget = {
  _id: Id<"inventoryItems">;
  label: string;
  /** Units nested inside it, so retiring asks what happens to them. */
  holds: number;
};

const REASON_GROUPS: { heading: string; reasons: RetirementReason[] }[] = [
  {
    heading: "Might come back",
    reasons: RETIREMENT_REASON_ORDER.filter((reason) => RETIREMENT_REASONS[reason].mayReturn),
  },
  {
    heading: "Gone for good",
    reasons: RETIREMENT_REASON_ORDER.filter((reason) => !RETIREMENT_REASONS[reason].mayReturn),
  },
];

/**
 * Take a unit out of service with a reason. It stays on record (history,
 * damage, its public page) but leaves the list, pull lists and checkout.
 */
export function RetireItemDialog({
  target,
  onOpenChange,
  onRetired,
}: {
  target: LifecycleTarget | null;
  onOpenChange: (open: boolean) => void;
  onRetired?: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl" data-testid="retire-item-dialog">
        {target ? (
          <RetireItemBody
            key={target._id}
            target={target}
            onCancel={() => onOpenChange(false)}
            onRetired={() => {
              onOpenChange(false);
              onRetired?.();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function RetireItemBody({
  target,
  onCancel,
  onRetired,
}: {
  target: LifecycleTarget;
  onCancel: () => void;
  onRetired: () => void;
}) {
  const retire = useMutation(api.inventoryLifecycle.retire);
  const [reason, setReason] = useState<RetirementReason | null>(null);
  const [notes, setNotes] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [replacementId, setReplacementId] = useState("");
  const [includeContents, setIncludeContents] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const info = reason ? RETIREMENT_REASONS[reason] : null;
  // Until someone ticks the box, follow the reason: a lost case loses its contents.
  const contentsToo = includeContents ?? Boolean(info?.contentsGoToo);
  const missing =
    !reason ||
    (reason === "other" && !notes.trim()) ||
    (reason === "duplicate" && !replacementId);

  async function submit() {
    if (!reason) return;
    setBusy(true);
    setError(null);
    try {
      const amountUsd = info?.asksAmount && amount.trim() ? Number(amount) : undefined;
      const result = await retire({
        id: target._id,
        reason,
        notes: notes.trim() || undefined,
        counterparty: info?.counterpartyLabel ? counterparty.trim() || undefined : undefined,
        amountUsd,
        replacementItemId: info?.replacementLabel && replacementId ? (replacementId as Id<"inventoryItems">) : undefined,
        includeContents: target.holds > 0 && contentsToo,
      });
      notify.success(
        result.retiredCount > 1
          ? `Retired ${target.label} and ${result.retiredCount - 1} inside it.`
          : `Retired ${target.label}.`,
      );
      onRetired();
    } catch (err) {
      setError(getConvexErrorMessage(err, "Could not retire the item."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Retire {target.label}?</DialogTitle>
        <DialogDescription>
          It leaves the items list, pull lists and checkout, but keeps its history, damage reports and public
          page. You can reinstate it later.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3" role="radiogroup" aria-label="Why is it leaving service?">
        {REASON_GROUPS.map((group) => (
          <div key={group.heading} className="space-y-1.5">
            <p className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">{group.heading}</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {group.reasons.map((value) => {
                const option = RETIREMENT_REASONS[value];
                const checked = reason === value;
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    data-testid={`retire-reason-${value}`}
                    onClick={() => setReason(value)}
                    className={cn(
                      "border px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      checked && "border-primary bg-primary/5 ring-1 ring-primary hover:bg-primary/5",
                    )}
                  >
                    <span className="block text-sm font-medium">{option.label}</span>
                    <span className="block text-xs text-muted-foreground">{option.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {info?.counterpartyLabel || info?.asksAmount ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {info.counterpartyLabel ? (
            <div className="space-y-1.5">
              <Label htmlFor="retire-counterparty">{info.counterpartyLabel}</Label>
              <Input
                id="retire-counterparty"
                value={counterparty}
                onChange={(event) => setCounterparty(event.target.value)}
                placeholder="Optional"
              />
            </div>
          ) : null}
          {info.asksAmount ? (
            <div className="space-y-1.5">
              <Label htmlFor="retire-amount">Sold for (USD)</Label>
              <Input
                id="retire-amount"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="Optional"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {info?.replacementLabel ? (
        <div className="space-y-1.5">
          <Label htmlFor="retire-replacement">
            {info.replacementLabel}
            {reason === "duplicate" ? "" : " (optional)"}
          </Label>
          <InventoryItemSearchSelect
            id="retire-replacement"
            value={replacementId}
            onChange={(value) => setReplacementId(value)}
            excludeId={target._id}
            emptyLabel="Pick an item"
          />
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="retire-notes">Note{reason === "other" ? "" : " (optional)"}</Label>
        <Textarea
          id="retire-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={reason === "stolen" ? "Police report or insurance claim number" : "What happened"}
          className="min-h-16"
        />
      </div>

      {target.holds > 0 && reason ? (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={contentsToo}
            onCheckedChange={(checked) => setIncludeContents(checked === true)}
            className="mt-0.5"
          />
          <span>
            Also retire the {target.holds === 1 ? "item" : `${target.holds} items`} inside it
            <span className="block text-xs text-muted-foreground">
              {contentsToo
                ? "They stay packed inside, so reinstating the case brings them back."
                : "They're taken out of it and stay in service."}
            </span>
          </span>
        </label>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          disabled={busy || missing}
          onClick={() => void submit()}
        >
          {busy ? "Retiring…" : info ? `Retire as ${info.label.toLowerCase()}` : "Retire"}
        </Button>
      </DialogFooter>
    </>
  );
}

/**
 * Relabel a unit whose tag was damaged, lost or renumbered. The old tag keeps
 * pointing at it (scans, public page), so an old sticker still works.
 */
export function RetagItemDialog({
  target,
  onOpenChange,
}: {
  target: { _id: Id<"inventoryItems">; assetId: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="retag-item-dialog">
        {target ? <RetagItemBody key={target._id} target={target} onDone={() => onOpenChange(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function RetagItemBody({
  target,
  onDone,
}: {
  target: { _id: Id<"inventoryItems">; assetId: string };
  onDone: () => void;
}) {
  const retag = useMutation(api.inventoryLifecycle.retag);
  const [newTag, setNewTag] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const result = await retag({ id: target._id, newAssetId: newTag, notes: notes.trim() || undefined });
      notify.success(`${target.assetId} is now ${result.assetId}.`);
      onDone();
    } catch (err) {
      setError(getConvexErrorMessage(err, "Could not change the tag."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <DialogHeader>
        <DialogTitle>Replace tag {target.assetId}</DialogTitle>
        <DialogDescription>
          For a label that was damaged, lost or renumbered. The unit stays in service, and {target.assetId} keeps
          finding it when scanned.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-1.5">
        <Label htmlFor="retag-new">New tag</Label>
        <ScanInput
          id="retag-new"
          value={newTag}
          onChange={setNewTag}
          onScan={(raw) => setNewTag(normalizeAssetScanInput(raw) ?? raw.trim())}
          placeholder="Scan or type, e.g. ALE-0120"
          autoFocus
          ariaLabel="New tag"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="retag-notes">Note (optional)</Label>
        <Input
          id="retag-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="e.g. old label peeled off"
        />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy || !newTag.trim()}>
          {busy ? "Saving…" : "Replace tag"}
        </Button>
      </DialogFooter>
    </form>
  );
}
