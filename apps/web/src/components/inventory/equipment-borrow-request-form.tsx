"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DateTimeRangePicker } from "@/components/ui/date-time-picker";
import {
  InventoryPackageSearchSelect,
  InventoryTypeSearchSelect,
} from "@/components/inventory/inventory-search-select";
import { VenuePicker } from "@/components/venues/venue-picker";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { pacificDateTimeInputToMs } from "@/lib/format";

type LineKind = "type" | "package";

type DraftLine = {
  key: string;
  lineKind: LineKind;
  typeId: string;
  packageId: string;
  quantity: string;
};

function makeDraftLine(): DraftLine {
  return {
    key: crypto.randomUUID(),
    lineKind: "type",
    typeId: "",
    packageId: "",
    quantity: "1",
  };
}

export function EquipmentBorrowRequestForm({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
}) {
  const submit = useMutation(api.equipmentBorrowRequests.submit);
  const [purpose, setPurpose] = useState("");
  const [venueId, setVenueId] = useState("");
  const [notes, setNotes] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([makeDraftLine()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPurpose("");
    setVenueId("");
    setNotes("");
    setWindowStart("");
    setWindowEnd("");
    setLines([makeDraftLine()]);
    setError(null);
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  async function handleSubmit() {
    setError(null);
    const startAt = pacificDateTimeInputToMs(windowStart);
    const endAt = pacificDateTimeInputToMs(windowEnd);
    if (!purpose.trim()) {
      setError("Add a short purpose for the borrow.");
      return;
    }
    if (startAt == null) {
      setError("Pick a pickup date and time.");
      return;
    }
    if (endAt == null) {
      setError("Pick a return date and time.");
      return;
    }
    if (endAt <= startAt) {
      setError("Return time must be after the pickup time.");
      return;
    }

    if (lines.length === 0) {
      setError("Add at least one piece of equipment.");
      return;
    }
    for (const line of lines) {
      if (line.lineKind === "package" && !line.packageId) {
        setError("Select a package for every equipment line.");
        return;
      }
      if (line.lineKind === "type" && !line.typeId) {
        setError("Select a type for every equipment line.");
        return;
      }
      const quantity = Math.floor(Number(line.quantity));
      if (!Number.isFinite(quantity) || quantity < 1) {
        setError("Each equipment line needs a quantity of at least 1.");
        return;
      }
    }

    const payloadLines = lines.map((line) => {
      const quantity = Math.floor(Number(line.quantity));
      return line.lineKind === "package"
        ? {
            lineKind: "package" as const,
            packageId: line.packageId as Id<"inventoryPackages">,
            quantity,
          }
        : {
            lineKind: "type" as const,
            typeId: line.typeId as Id<"inventoryTypes">,
            quantity,
          };
    });

    setBusy(true);
    try {
      await submit({
        purpose: purpose.trim(),
        venueId: venueId ? (venueId as Id<"venues">) : undefined,
        notes: notes.trim() || undefined,
        startAt,
        endAt,
        lines: payloadLines,
      });
      notify.success("Borrow request submitted.");
      reset();
      onOpenChange(false);
      onCreated?.();
    } catch (err) {
      const message = getConvexErrorMessage(err, "Unable to submit the borrow request.");
      setError(message);
      notify.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New borrow request</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-4">
          <div className="space-y-2">
            <Label htmlFor="borrow-purpose">Purpose</Label>
            <Input
              id="borrow-purpose"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="What is the equipment for?"
            />
          </div>

          <div className="space-y-2">
            <Label>Pickup and return</Label>
            <DateTimeRangePicker
              startValue={windowStart}
              endValue={windowEnd}
              onChange={({ start, end }) => {
                setWindowStart(start);
                setWindowEnd(end);
              }}
              placeholder="Select pickup and return"
            />
          </div>

          <div className="space-y-2">
            <Label>Venue</Label>
            <VenuePicker
              value={venueId}
              onChange={setVenueId}
              allowCreate
              emptyLabel="No venue"
              placeholder="Type to search venues…"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="borrow-notes">Notes</Label>
            <textarea
              id="borrow-notes"
              className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything else we should know?"
            />
          </div>

          <div className="space-y-2">
            <Label>Equipment</Label>
            <div className="space-y-2">
              {lines.map((line) => (
                <div key={line.key} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-md border p-0.5">
                      {(["type", "package"] as const).map((kind) => (
                        <Button
                          key={kind}
                          type="button"
                          size="sm"
                          variant={line.lineKind === kind ? "secondary" : "ghost"}
                          className="h-7 px-2 text-xs"
                          onClick={() => updateLine(line.key, { lineKind: kind })}
                        >
                          {kind === "type" ? "Type" : "Package"}
                        </Button>
                      ))}
                    </div>
                    <div className="ml-auto flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        className="w-16"
                        aria-label="Quantity"
                        value={line.quantity}
                        onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remove line"
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((prev) => prev.filter((candidate) => candidate.key !== line.key))
                        }
                      >
                        <TrashIcon className="size-4" />
                      </Button>
                    </div>
                  </div>
                  {line.lineKind === "type" ? (
                    <InventoryTypeSearchSelect
                      value={line.typeId}
                      onChange={(value) => updateLine(line.key, { typeId: value })}
                      emptyLabel="Select type"
                    />
                  ) : (
                    <InventoryPackageSearchSelect
                      value={line.packageId}
                      onChange={(value) => updateLine(line.key, { packageId: value })}
                      emptyLabel="Select package"
                      activeOnly
                    />
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLines((prev) => [...prev, makeDraftLine()])}
            >
              <PlusIcon className="size-4" /> Add equipment
            </Button>
          </div>

          {error ? <p className="text-sm text-status-rose-600">{error}</p> : null}
        </div>

        <SheetFooter className="mt-auto flex-row justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? "Submitting…" : "Submit request"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
