"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { InventoryItemSearchSelect } from "@/components/inventory/inventory-search-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { FLAG_REASON_LABELS, type FlagReason } from "@/lib/hashing";
import { notify } from "@/lib/notify";

export type FlagTarget = {
  itemKey: string;
  text: string;
  check?: { status: "done" | "flagged"; flagReason?: FlagReason; note?: string; resolved: boolean; sentToDamage: boolean };
};

const REASONS = Object.keys(FLAG_REASON_LABELS) as FlagReason[];
const TOGGLE_ROW = "w-full [&>button]:h-11 [&>button]:flex-1 [&>button]:px-1";

function FlagForm({
  hashDateId,
  target,
  onClose,
}: {
  hashDateId: Id<"hashDates">;
  target: FlagTarget;
  onClose: () => void;
}) {
  const flagItem = useMutation(api.hashingLive.flagItem);
  const removeFlag = useMutation(api.hashingLive.removeFlag);
  const flagged = target.check?.status === "flagged" ? target.check : undefined;
  const [reason, setReason] = useState<FlagReason | "">(flagged?.flagReason ?? "");
  const [note, setNote] = useState(flagged?.note ?? "");
  const [sendToDamage, setSendToDamage] = useState(false);
  const [inventoryItemId, setInventoryItemId] = useState("");
  const [operability, setOperability] = useState<"functional" | "needs_repair">("needs_repair");
  const [severity, setSeverity] = useState("3");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reporting = reason === "damaged" && sendToDamage && !flagged?.sentToDamage;

  async function run(action: () => Promise<unknown>, success: string) {
    setSaving(true);
    setError(null);
    try {
      await action();
      notify.success(success);
      onClose();
    } catch (saveError) {
      setError(getConvexErrorMessage(saveError, "Couldn't save that."));
    } finally {
      setSaving(false);
    }
  }

  function save() {
    if (!reason) return;
    void run(
      () =>
        flagItem({
          hashDateId,
          itemKey: target.itemKey,
          reason,
          note: note.trim() || undefined,
          damage: reporting
            ? {
                inventoryItemId: inventoryItemId as Id<"inventoryItems">,
                operability,
                severity: Number(severity),
              }
            : undefined,
        }),
      reporting ? "Flagged and sent to Damage & repair." : "Flagged.",
    );
  }

  return (
    <div className="space-y-4 px-4 pb-6">
      <div className="space-y-1.5">
        <Label id="hash-flag-reason">Reason</Label>
        <ToggleGroup
          type="single"
          variant="outline"
          value={reason}
          onValueChange={(value) => setReason(value as FlagReason | "")}
          aria-labelledby="hash-flag-reason"
          className={TOGGLE_ROW}
        >
          {REASONS.map((value) => (
            <ToggleGroupItem key={value} value={value} data-testid={`hash-flag-${value}`}>
              {FLAG_REASON_LABELS[value]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="hash-flag-note">Details</Label>
        <Textarea id="hash-flag-note" value={note} onChange={(event) => setNote(event.target.value)} />
      </div>

      {reason === "damaged" && !flagged?.sentToDamage ? (
        <div className="space-y-3 border p-3">
          <Label className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={sendToDamage}
              data-testid="hash-flag-damage"
              onCheckedChange={(checked) => setSendToDamage(checked === true)}
            />
            Also send to Damage &amp; repair
          </Label>
          {sendToDamage ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="hash-flag-item">Item</Label>
                <InventoryItemSearchSelect
                  id="hash-flag-item"
                  value={inventoryItemId}
                  onChange={(value) => setInventoryItemId(value)}
                  placeholder="Search tag, serial or type, e.g. SM58"
                />
              </div>
              <div className="space-y-1.5">
                <Label id="hash-flag-operability">Does it work?</Label>
                <ToggleGroup
                  type="single"
                  variant="outline"
                  value={operability}
                  onValueChange={(value) => value && setOperability(value as typeof operability)}
                  aria-labelledby="hash-flag-operability"
                  className={TOGGLE_ROW}
                >
                  <ToggleGroupItem value="functional">Still works</ToggleGroupItem>
                  <ToggleGroupItem value="needs_repair">Needs repair</ToggleGroupItem>
                </ToggleGroup>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hash-flag-severity">Damage severity (1–5)</Label>
                <Input
                  id="hash-flag-severity"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={5}
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value)}
                />
              </div>
            </>
          ) : null}
        </div>
      ) : null}
      {flagged?.sentToDamage ? <p className="text-sm text-muted-foreground">Sent to Damage &amp; repair.</p> : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {flagged && !flagged.resolved && !flagged.sentToDamage ? (
          <Button
            variant="ghost"
            className="mr-auto h-11"
            disabled={saving}
            data-testid="hash-flag-remove"
            onClick={() =>
              void run(() => removeFlag({ hashDateId, itemKey: target.itemKey }), "Flag removed.")
            }
          >
            Remove flag
          </Button>
        ) : null}
        <Button variant="outline" className="h-11" onClick={onClose}>
          Cancel
        </Button>
        <Button
          className="h-11"
          disabled={saving || !reason || (reporting && !inventoryItemId)}
          data-testid="hash-flag-save"
          onClick={save}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

export function FlagSheet({
  hashDateId,
  target,
  onClose,
}: {
  hashDateId: Id<"hashDates">;
  target: FlagTarget | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[85dvh] overflow-y-auto" data-testid="hash-flag-sheet">
        <SheetHeader>
          <SheetTitle>Flag this item</SheetTitle>
          <SheetDescription className="break-words">{target?.text}</SheetDescription>
        </SheetHeader>
        {target ? <FlagForm key={target.itemKey} hashDateId={hashDateId} target={target} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}
