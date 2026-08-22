"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { AssetScanner } from "@/components/inventory/asset-scanner";
import { EventSelect } from "@/components/events/event-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useR2FileUpload } from "@/hooks/use-r2-file-upload";
import { getConvexErrorMessage } from "@/lib/convex-error";

type DamageScope = "this_only" | "all_including_children" | "children_only" | "some_children";

type DamageReportWizardProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialInventoryItemId?: Id<"inventoryItems">;
  initialAssetRaw?: string;
  initialEventId?: Id<"events">;
  onCreated?: (reportIds: Id<"damageReports">[]) => void;
};

function DamageReportWizardForm({
  initialInventoryItemId,
  initialAssetRaw,
  initialEventId,
  onCreated,
  onClose,
}: {
  initialInventoryItemId?: Id<"inventoryItems">;
  initialAssetRaw?: string;
  initialEventId?: Id<"events">;
  onCreated?: (reportIds: Id<"damageReports">[]) => void;
  onClose: () => void;
}) {
  const createReports = useMutation(api.damageReports.create);
  const [rawScan, setRawScan] = useState(initialAssetRaw ?? "");
  const [scope, setScope] = useState<DamageScope>("this_only");
  const [someItemIds, setSomeItemIds] = useState<string[]>([]);
  const [operability, setOperability] = useState<"functional" | "needs_repair">("needs_repair");
  const [severity, setSeverity] = useState("3");
  const [notes, setNotes] = useState("");
  const [eventId, setEventId] = useState(initialEventId ?? "");
  const [eventUnknown, setEventUnknown] = useState(!initialEventId);
  const [photoStored, setPhotoStored] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const resolved = useQuery(
    api.eventRentalFulfillment.resolveAssetScan,
    rawScan.trim() ? { raw: rawScan } : "skip",
  );
  const effectiveItemId = initialInventoryItemId ?? resolved?.inventoryItemId;
  const children = useQuery(
    api.damageReports.getItemChildren,
    effectiveItemId ? { inventoryItemId: effectiveItemId } : "skip",
  );

  const upload = useR2FileUpload({
    scope: "inventory",
    entityKind: "item",
    purpose: "damage",
    entityId: effectiveItemId,
  });

  const hasChildren = (children?.length ?? 0) > 0;
  const photoKey = useMemo(() => {
    if (!photoStored) return undefined;
    const trimmed = photoStored.trim();
    if (trimmed.startsWith("r2:")) return trimmed.slice(3) || undefined;
    if (trimmed.startsWith("inventory/")) return trimmed;
    return undefined;
  }, [photoStored]);

  async function submit() {
    if (!effectiveItemId) {
      setError("Scan or select an asset first.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await createReports({
        inventoryItemId: effectiveItemId,
        eventId: eventUnknown ? undefined : (eventId as Id<"events">),
        eventUnknown,
        scope: hasChildren ? scope : "this_only",
        someItemIds:
          scope === "some_children" ? (someItemIds as Id<"inventoryItems">[]) : undefined,
        operability,
        severity: Number(severity),
        notes: notes.trim() || undefined,
        photoR2Key: photoKey,
      });
      onCreated?.(result.reportIds);
      onClose();
    } catch (err) {
      setError(getConvexErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 space-y-4 px-4 pb-8">
      {!initialInventoryItemId ? (
        <AssetScanner onSubmit={(raw) => setRawScan(raw)} autoFocus />
      ) : null}

          {effectiveItemId ? (
            <p className="text-sm text-muted-foreground">
              Asset selected
              {resolved?.assetId ? `: ${resolved.assetId} (${resolved.typeName})` : null}
              {initialInventoryItemId && !resolved ? " (from item)" : null}
            </p>
          ) : rawScan.trim() && resolved === null ? (
            <p className="text-sm text-destructive">
              No inventory item found for “{rawScan.trim()}”. Try an asset tag like ALE-0041 or
              https://arbor.st/e/….
            </p>
          ) : null}

      {hasChildren ? (
        <div className="space-y-2">
          <Label>What is damaged?</Label>
          <div className="grid gap-2">
            {(
              [
                ["this_only", "Only this item"],
                ["all_including_children", "This item and everything inside"],
                ["children_only", "Only items inside"],
                ["some_children", "Some items inside"],
              ] as const
            ).map(([value, label]) => (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="damage-scope"
                  checked={scope === value}
                  onChange={() => setScope(value)}
                />
                {label}
              </label>
            ))}
          </div>
          {scope === "some_children" ? (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded border p-2">
              {(children ?? []).map((child) => {
                const checked = someItemIds.includes(child.inventoryItemId);
                return (
                  <label key={child.inventoryItemId} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setSomeItemIds((prev) =>
                          checked
                            ? prev.filter((id) => id !== child.inventoryItemId)
                            : [...prev, child.inventoryItemId],
                        );
                      }}
                    />
                    {child.assetId ? `${child.assetId} — ` : ""}
                    {child.typeName}
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>Can it still work?</Label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={operability === "functional"}
              onChange={() => setOperability("functional")}
            />
            Functional
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              checked={operability === "needs_repair"}
              onChange={() => setOperability("needs_repair")}
            />
            Needs repair
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="damage-severity">Damage severity (1–5)</Label>
        <Input
          id="damage-severity"
          type="number"
          min={1}
          max={5}
          value={severity}
          onChange={(event) => setSeverity(event.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="damage-photo">Photo</Label>
        <Input
          id="damage-photo"
          type="file"
          accept="image/*"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const stored = await upload.uploadFile(file);
            if (stored) setPhotoStored(stored);
          }}
        />
        {upload.error ? <p className="text-sm text-destructive">{upload.error}</p> : null}
        {photoStored ? <p className="text-xs text-muted-foreground">Photo attached.</p> : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="damage-notes">Notes</Label>
        <Input
          id="damage-notes"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional details"
        />
      </div>

      <div className="space-y-2">
        <Label>Related event</Label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={eventUnknown}
            onChange={(event) => setEventUnknown(event.target.checked)}
          />
          I don’t know when it happened
        </label>
        {!eventUnknown ? (
          <EventSelect value={eventId} onChange={setEventId} emptyLabel="Select event" />
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button type="button" onClick={() => void submit()} disabled={busy || upload.busy}>
        {busy ? "Submitting…" : "Submit damage report"}
      </Button>
    </div>
  );
}

export function DamageReportWizard({
  open,
  onOpenChange,
  initialInventoryItemId,
  initialAssetRaw,
  initialEventId,
  onCreated,
}: DamageReportWizardProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Report damage</SheetTitle>
          <SheetDescription>
            Any crew can report damage. Prefer linking an event when known. Scan a QR
            (`https://arbor.st/e/…`) or type an asset tag like `ALE-0041`.
          </SheetDescription>
        </SheetHeader>
        {open ? (
          <DamageReportWizardForm
            key={`${initialInventoryItemId ?? "scan"}:${initialEventId ?? "none"}:${initialAssetRaw ?? ""}`}
            initialInventoryItemId={initialInventoryItemId}
            initialAssetRaw={initialAssetRaw}
            initialEventId={initialEventId}
            onCreated={onCreated}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
