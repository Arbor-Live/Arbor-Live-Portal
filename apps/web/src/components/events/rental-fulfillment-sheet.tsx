"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { AssetScanner } from "@/components/inventory/asset-scanner";
import { DamageReportWizard } from "@/components/inventory/damage-report-wizard";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getConvexErrorMessage } from "@/lib/convex-error";

type Direction = "outbound" | "return";

type RentalFulfillmentSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: Id<"events">;
  direction: Direction;
  onMessage?: (message: string) => void;
  onError?: (message: string) => void;
};

export function RentalFulfillmentSheet({
  open,
  onOpenChange,
  eventId,
  direction,
  onMessage,
  onError,
}: RentalFulfillmentSheetProps) {
  const startOutbound = useMutation(api.eventRentalFulfillment.startOutbound);
  const scanOutbound = useMutation(api.eventRentalFulfillment.scanOutboundAsset);
  const setOutboundDisposition = useMutation(api.eventRentalFulfillment.setOutboundDisposition);
  const completeOutbound = useMutation(api.eventRentalFulfillment.completeOutbound);
  const startReturn = useMutation(api.eventRentalFulfillment.startReturn);
  const scanReturn = useMutation(api.eventRentalFulfillment.scanReturnAsset);
  const setReturnDisposition = useMutation(api.eventRentalFulfillment.setReturnDisposition);
  const completeReturn = useMutation(api.eventRentalFulfillment.completeReturn);

  const outbound = useQuery(
    api.eventRentalFulfillment.getOutboundWorkspace,
    open && direction === "outbound" ? { eventId } : "skip",
  );
  const returnWs = useQuery(
    api.eventRentalFulfillment.getReturnWorkspace,
    open && direction === "return" ? { eventId } : "skip",
  );

  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [damageForUnitId, setDamageForUnitId] = useState<Id<"eventRentalUnits"> | null>(null);
  const [damageItemId, setDamageItemId] = useState<Id<"inventoryItems"> | undefined>();
  const [showReceipt, setShowReceipt] = useState(false);

  const rented = useQuery(
    api.eventRentalFulfillment.listRentedEquipment,
    showReceipt || (direction === "outbound" && outbound?.status === "completed")
      ? { eventId }
      : "skip",
  );
  const summary = useQuery(api.eventRentalFulfillment.getFulfillmentSummary, { eventId });

  const pendingOutbound = useMemo(
    () => (outbound?.units ?? []).filter((unit) => unit.outboundStatus === "pending"),
    [outbound?.units],
  );
  const pendingReturn = useMemo(
    () =>
      (returnWs?.units ?? []).filter((unit) => (unit.returnStatus ?? "pending") === "pending"),
    [returnWs?.units],
  );

  async function ensureStarted() {
    setLocalError(null);
    try {
      if (direction === "outbound") {
        await startOutbound({ eventId });
      } else {
        await startReturn({ eventId });
      }
    } catch (err) {
      const message = getConvexErrorMessage(err);
      setLocalError(message);
      onError?.(message);
    }
  }

  async function handleScan(raw: string) {
    setBusy(true);
    setLocalError(null);
    try {
      if (direction === "outbound") {
        if (!outbound || outbound.status !== "in_progress") {
          await startOutbound({ eventId });
        }
        const result = await scanOutbound({ eventId, raw });
        const parts = [
          result.checkedOffCount
            ? `checked off ${result.checkedOffCount}`
            : null,
          result.addedCount ? `added ${result.addedCount}` : null,
        ].filter(Boolean);
        onMessage?.(
          parts.length
            ? `${result.assetId}: ${parts.join(", ")}${
                result.checkedOffCount + result.addedCount > 1 ? " (incl. contents)" : ""
              }`
            : `Scanned ${result.assetId}`,
        );
      } else {
        if (!returnWs || returnWs.status !== "in_progress") {
          await startReturn({ eventId });
        }
        const result = await scanReturn({ eventId, raw });
        onMessage?.(
          result.checkedInCount > 1
            ? `${result.assetId}: checked in ${result.checkedInCount} (incl. contents)`
            : `Checked in ${result.assetId}`,
        );
      }
    } catch (err) {
      const message = getConvexErrorMessage(err);
      setLocalError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  async function handleComplete() {
    setBusy(true);
    setLocalError(null);
    try {
      if (direction === "outbound") {
        const result = await completeOutbound({ eventId });
        setShowReceipt(true);
        onMessage?.(
          result.emailWarning ??
            `Delivery complete. ${result.rentedCount} item(s) rented. Client notified.`,
        );
      } else {
        const result = await completeReturn({ eventId });
        onMessage?.(result.emailWarning ?? "Return complete. Client notified.");
        onOpenChange(false);
      }
    } catch (err) {
      const message = getConvexErrorMessage(err);
      setLocalError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  const title = direction === "outbound" ? "Process delivery" : "Process return";
  const units = direction === "outbound" ? outbound?.units ?? [] : returnWs?.units ?? [];
  const inProgress =
    direction === "outbound"
      ? outbound?.status === "in_progress"
      : returnWs?.status === "in_progress";

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) setShowReceipt(false);
          onOpenChange(next);
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              Scan asset QR / barcode tags, or type a tag and press Enter.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-4 px-1 pb-10">
            {!inProgress && !showReceipt ? (
              summary?.returnCompleted && direction === "return" ? (
                <p className="text-sm text-muted-foreground">Return already completed for this event.</p>
              ) : outbound?.status === "completed" && direction === "outbound" ? (
                <p className="text-sm text-muted-foreground">Delivery already completed for this event.</p>
              ) : (
                <Button type="button" onClick={() => void ensureStarted()} disabled={busy}>
                  Start {direction === "outbound" ? "delivery" : "return"}
                </Button>
              )
            ) : null}

            {inProgress ? (
              <AssetScanner onSubmit={handleScan} disabled={busy} autoFocus />
            ) : null}

            {localError ? <p className="text-sm text-destructive">{localError}</p> : null}

            {direction === "outbound" && outbound ? (
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Pull list progress</h3>
                <ul className="space-y-2 text-sm">
                  {outbound.needs.map((need) => (
                    <li
                      key={`${need.pullListItemId}-${need.typeId}`}
                      className="flex items-center justify-between gap-2 rounded border px-2 py-1.5"
                    >
                      <span>{need.label}</span>
                      <span className="text-muted-foreground">
                        {need.quantityFulfilled}/{need.quantityRequired}
                      </span>
                    </li>
                  ))}
                </ul>

                {pendingOutbound.length ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium">
                      Unchecked ({pendingOutbound.length}) — set disposition to complete
                    </h3>
                    {pendingOutbound.map((unit) => (
                      <div
                        key={unit._id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-2"
                      >
                        <span className="text-sm">{unit.label}</span>
                        <div className="flex flex-wrap gap-1">
                          {(["replace", "no_tag", "removed"] as const).map((status) => (
                            <Button
                              key={status}
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                void setOutboundDisposition({ unitId: unit._id, status }).catch(
                                  (err) => setLocalError(getConvexErrorMessage(err)),
                                )
                              }
                            >
                              {status === "no_tag" ? "No tag" : status[0]!.toUpperCase() + status.slice(1)}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="space-y-2">
                  <h3 className="text-sm font-medium">Checked / resolved</h3>
                  <ul className="max-h-48 space-y-1 overflow-y-auto text-sm">
                    {units
                      .filter((unit) => unit.outboundStatus !== "pending")
                      .map((unit) => (
                        <li key={unit._id} className="text-muted-foreground">
                          {unit.label}
                          {unit.assetId ? ` · ${unit.assetId}` : ""} · {unit.outboundStatus}
                        </li>
                      ))}
                  </ul>
                </div>
              </div>
            ) : null}

            {direction === "return" && returnWs ? (
              <div className="space-y-3">
                <h3 className="text-sm font-medium">Rented equipment</h3>
                {pendingReturn.map((unit) => (
                  <div
                    key={unit._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-2"
                  >
                    <div className="text-sm">
                      <div>{unit.label}</div>
                      <div className="text-muted-foreground">
                        {unit.assetId ?? "No tag"} · pending
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {(["no_tag", "missing", "manual"] as const).map((status) => (
                        <Button
                          key={status}
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void setReturnDisposition({ unitId: unit._id, status }).catch((err) =>
                              setLocalError(getConvexErrorMessage(err)),
                            )
                          }
                        >
                          {status === "no_tag" ? "No tag" : status[0]!.toUpperCase() + status.slice(1)}
                        </Button>
                      ))}
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={busy || !unit.inventoryItemId}
                        onClick={() => {
                          if (!unit.inventoryItemId) return;
                          setDamageForUnitId(unit._id);
                          setDamageItemId(unit.inventoryItemId);
                        }}
                      >
                        Damaged
                      </Button>
                    </div>
                  </div>
                ))}
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                  {units
                    .filter((unit) => (unit.returnStatus ?? "pending") !== "pending")
                    .map((unit) => (
                      <li key={unit._id}>
                        {unit.label}
                        {unit.assetId ? ` · ${unit.assetId}` : ""} · {unit.returnStatus}
                      </li>
                    ))}
                </ul>
              </div>
            ) : null}

            {showReceipt || (direction === "outbound" && outbound?.status === "completed") ? (
              <div className="space-y-2 rounded border p-3">
                <h3 className="text-sm font-medium">Rented equipment</h3>
                <ul className="space-y-1 text-sm">
                  {(rented ?? []).map((unit) => (
                    <li key={unit._id}>
                      {unit.label}
                      {unit.assetId ? ` · ${unit.assetId}` : " · no tag"}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {inProgress ? (
              <Button type="button" onClick={() => void handleComplete()} disabled={busy}>
                Complete {direction === "outbound" ? "delivery" : "return"}
              </Button>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      <DamageReportWizard
        open={Boolean(damageForUnitId && damageItemId)}
        onOpenChange={(next) => {
          if (!next) {
            setDamageForUnitId(null);
            setDamageItemId(undefined);
          }
        }}
        initialInventoryItemId={damageItemId}
        initialEventId={eventId}
        onCreated={(reportIds) => {
          const reportId = reportIds[0];
          if (!damageForUnitId || !reportId) return;
          void setReturnDisposition({
            unitId: damageForUnitId,
            status: "damaged",
            damageReportId: reportId,
          })
            .then(() => {
              setDamageForUnitId(null);
              setDamageItemId(undefined);
              onMessage?.("Damage reported and unit marked damaged.");
            })
            .catch((err) => setLocalError(getConvexErrorMessage(err)));
        }}
      />
    </>
  );
}
