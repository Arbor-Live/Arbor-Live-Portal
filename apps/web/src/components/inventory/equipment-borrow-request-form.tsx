"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { ArrowLeftIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
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
import { DateTimeRangePicker } from "@/components/ui/date-time-picker";
import { Textarea } from "@/components/ui/textarea";
import {
  InventoryPackageSearchSelect,
  InventoryTypeSearchSelect,
} from "@/components/inventory/inventory-search-select";
import { VenuePicker } from "@/components/venues/venue-picker";
import {
  BorrowAgreementStep,
  isBorrowAgreementComplete,
} from "@/components/inventory/borrow-agreement-step";
import { useSessionShell } from "@/components/session-shell-provider";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { BORROW_AGREEMENT_VERSION, pacificDateTimeInputToMs } from "@/lib/format";

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
  const signerEmail = useSessionShell()?.account?.email ?? undefined;
  const [step, setStep] = useState<"details" | "agreement">("details");
  const [purpose, setPurpose] = useState("");
  const [venueId, setVenueId] = useState("");
  const [notes, setNotes] = useState("");
  const [windowStart, setWindowStart] = useState("");
  const [windowEnd, setWindowEnd] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([makeDraftLine()]);
  const [acceptedTerms, setAcceptedTerms] = useState<Set<string>>(() => new Set());
  const [signedName, setSignedName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep("details");
    setAcceptedTerms(new Set());
    setSignedName("");
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

  function toggleTerm(key: string, checked: boolean) {
    setAcceptedTerms((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  /** Returns the first problem with the request details, or null when they're complete. */
  function detailsError(): string | null {
    const startAt = pacificDateTimeInputToMs(windowStart);
    const endAt = pacificDateTimeInputToMs(windowEnd);
    if (!purpose.trim()) return "Add a short purpose for the borrow.";
    if (startAt == null) return "Pick a pickup date and time.";
    if (endAt == null) return "Pick a return date and time.";
    if (endAt <= startAt) return "Return time must be after the pickup time.";
    if (lines.length === 0) return "Add at least one piece of equipment.";
    for (const line of lines) {
      if (line.lineKind === "package" && !line.packageId) {
        return "Select a package for every equipment line.";
      }
      if (line.lineKind === "type" && !line.typeId) return "Select a type for every equipment line.";
      const quantity = Math.floor(Number(line.quantity));
      if (!Number.isFinite(quantity) || quantity < 1) {
        return "Each equipment line needs a quantity of at least 1.";
      }
    }
    return null;
  }

  function handleContinue() {
    const problem = detailsError();
    setError(problem);
    if (!problem) setStep("agreement");
  }

  async function handleSubmit() {
    const problem = detailsError();
    const startAt = pacificDateTimeInputToMs(windowStart);
    const endAt = pacificDateTimeInputToMs(windowEnd);
    if (problem || startAt == null || endAt == null) {
      setError(problem);
      setStep("details");
      return;
    }
    if (!isBorrowAgreementComplete(acceptedTerms, signedName)) {
      setError("Confirm every term and type your full legal name to sign.");
      return;
    }
    setError(null);

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
        agreement: {
          version: BORROW_AGREEMENT_VERSION,
          acceptedTermKeys: [...acceptedTerms],
          signedName: signedName.trim(),
        },
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
          <SheetTitle>
            {step === "details" ? "New borrow request" : "Loan agreement"}
          </SheetTitle>
          <SheetDescription>
            {step === "details"
              ? "Step 1 of 2 · What you need and when"
              : "Step 2 of 2 · Confirm each term and sign"}
          </SheetDescription>
        </SheetHeader>

        {step === "agreement" ? (
          <div className="px-4 pb-4">
            <BorrowAgreementStep
              accepted={acceptedTerms}
              onToggle={toggleTerm}
              signedName={signedName}
              onSignedNameChange={setSignedName}
              signerEmail={signerEmail}
            />
            {error ? <p className="mt-4 text-sm text-status-rose-600">{error}</p> : null}
          </div>
        ) : (
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
              <Label htmlFor="borrow-window">Pickup and return</Label>
              <DateTimeRangePicker
                id="borrow-window"
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
              <Label htmlFor="borrow-venue">Venue</Label>
              <VenuePicker
                id="borrow-venue"
                value={venueId}
                onChange={setVenueId}
                allowCreate
                emptyLabel="No venue"
                placeholder="Type to search venues…"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="borrow-notes">Notes</Label>
              <Textarea
                id="borrow-notes"
                className="min-h-20"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Anything else we should know?"
              />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Equipment</p>
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
        )}

        <SheetFooter className="mt-auto flex-row justify-end gap-2">
          {step === "details" ? (
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleContinue}>
                Continue to agreement
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                className="mr-auto"
                onClick={() => {
                  setError(null);
                  setStep("details");
                }}
                disabled={busy}
              >
                <ArrowLeftIcon className="size-4" /> Back
              </Button>
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={busy || !isBorrowAgreementComplete(acceptedTerms, signedName)}
              >
                {busy ? "Submitting…" : "Sign and submit"}
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
