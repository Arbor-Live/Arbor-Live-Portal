"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { DotsThreeIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { AssetScanner } from "@/components/inventory/asset-scanner";
import { DamageReportWizard } from "@/components/inventory/damage-report-wizard";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import {
  optimisticCompleteOutbound,
  optimisticCompleteReturn,
  optimisticResendOutboundEmail,
  optimisticResendReturnEmail,
  optimisticSetOutboundDisposition,
  optimisticSetReturnDisposition,
  optimisticUndoOutboundUnit,
  optimisticUndoReturnUnit,
} from "@/lib/rental-fulfillment-optimistic";
import { cn } from "@/lib/utils";

type Direction = "outbound" | "return";
type ListFilter = "remaining" | "done" | "all";
type Phase = "pack" | "exceptions";

type RentalFulfillmentSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: Id<"events">;
  direction: Direction;
  onMessage?: (message: string) => void;
  onError?: (message: string) => void;
};

type OutboundUnit = {
  _id: Id<"eventRentalUnits">;
  label: string;
  assetId?: string;
  outboundStatus: "pending" | "scanned" | "replace" | "no_tag" | "removed";
  pullListItemId?: Id<"eventPullListItems">;
  typeId?: Id<"inventoryTypes">;
};

type ReturnUnit = {
  _id: Id<"eventRentalUnits">;
  label: string;
  assetId?: string;
  inventoryItemId?: Id<"inventoryItems">;
  returnStatus?: "pending" | "scanned" | "no_tag" | "missing" | "damaged" | "manual";
};

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-foreground transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function FilterChips({
  value,
  onChange,
  remainingCount,
  doneCount,
}: {
  value: ListFilter;
  onChange: (next: ListFilter) => void;
  remainingCount: number;
  doneCount: number;
}) {
  const chips: Array<{ id: ListFilter; label: string; count: number }> = [
    { id: "remaining", label: "Remaining", count: remainingCount },
    { id: "done", label: "Done", count: doneCount },
    { id: "all", label: "All", count: remainingCount + doneCount },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          onClick={() => onChange(chip.id)}
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
            value === chip.id
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          {chip.label} {chip.count}
        </button>
      ))}
    </div>
  );
}

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
  const setOutboundDisposition = useMutation(
    api.eventRentalFulfillment.setOutboundDisposition,
  ).withOptimisticUpdate(optimisticSetOutboundDisposition);
  const undoOutboundUnit = useMutation(
    api.eventRentalFulfillment.undoOutboundUnit,
  ).withOptimisticUpdate(optimisticUndoOutboundUnit);
  const completeOutbound = useMutation(
    api.eventRentalFulfillment.completeOutbound,
  ).withOptimisticUpdate(optimisticCompleteOutbound);
  const resendOutboundClientEmail = useMutation(
    api.eventRentalFulfillment.resendOutboundClientEmail,
  ).withOptimisticUpdate(optimisticResendOutboundEmail);
  const startReturn = useMutation(api.eventRentalFulfillment.startReturn);
  const scanReturn = useMutation(api.eventRentalFulfillment.scanReturnAsset);
  const setReturnDisposition = useMutation(
    api.eventRentalFulfillment.setReturnDisposition,
  ).withOptimisticUpdate(optimisticSetReturnDisposition);
  const undoReturnUnit = useMutation(
    api.eventRentalFulfillment.undoReturnUnit,
  ).withOptimisticUpdate(optimisticUndoReturnUnit);
  const completeReturn = useMutation(
    api.eventRentalFulfillment.completeReturn,
  ).withOptimisticUpdate(optimisticCompleteReturn);
  const resendReturnClientEmail = useMutation(
    api.eventRentalFulfillment.resendReturnClientEmail,
  ).withOptimisticUpdate(optimisticResendReturnEmail);

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
  const [completeWarning, setCompleteWarning] = useState<string | null>(null);
  const [listFilter, setListFilter] = useState<ListFilter>("remaining");
  const [phase, setPhase] = useState<Phase>("pack");

  const rented = useQuery(
    api.eventRentalFulfillment.listRentedEquipment,
    open &&
      (showReceipt || (direction === "outbound" && outbound?.status === "completed"))
      ? { eventId }
      : "skip",
  );
  const summary = useQuery(
    api.eventRentalFulfillment.getFulfillmentSummary,
    open ? { eventId } : "skip",
  );

  const outboundUnits = useMemo(
    () => (outbound?.units ?? []) as OutboundUnit[],
    [outbound?.units],
  );
  const returnUnits = useMemo(
    () => (returnWs?.units ?? []) as ReturnUnit[],
    [returnWs?.units],
  );

  const pendingOutbound = useMemo(
    () => outboundUnits.filter((unit) => unit.outboundStatus === "pending"),
    [outboundUnits],
  );
  const doneOutbound = useMemo(
    () => outboundUnits.filter((unit) => unit.outboundStatus !== "pending"),
    [outboundUnits],
  );
  const pendingReturn = useMemo(
    () => returnUnits.filter((unit) => (unit.returnStatus ?? "pending") === "pending"),
    [returnUnits],
  );
  const doneReturn = useMemo(
    () => returnUnits.filter((unit) => (unit.returnStatus ?? "pending") !== "pending"),
    [returnUnits],
  );

  const pendingCount = direction === "outbound" ? pendingOutbound.length : pendingReturn.length;
  const doneCount = direction === "outbound" ? doneOutbound.length : doneReturn.length;
  const totalCount = pendingCount + doneCount;

  const progressDone =
    direction === "outbound"
      ? (outbound?.needs ?? []).reduce((sum, need) => sum + need.quantityFulfilled, 0)
      : doneCount;
  const progressTotal =
    direction === "outbound"
      ? (outbound?.needs ?? []).reduce((sum, need) => sum + need.quantityRequired, 0)
      : totalCount;

  const clientNotify =
    direction === "outbound" ? outbound?.clientNotify : returnWs?.clientNotify;
  const clientEmailAlreadyQueued =
    direction === "outbound"
      ? outbound?.clientEmailAlreadyQueued
      : returnWs?.clientEmailAlreadyQueued;

  const inProgress =
    direction === "outbound"
      ? outbound?.status === "in_progress"
      : returnWs?.status === "in_progress";
  const showCompletedOutbound =
    direction === "outbound" && (showReceipt || outbound?.status === "completed");
  const showCompletedReturn = direction === "return" && returnWs?.status === "completed";
  const isExceptions = phase === "exceptions" && inProgress && pendingCount > 0;

  const visibleOutbound = useMemo(() => {
    if (listFilter === "remaining" || isExceptions) return pendingOutbound;
    if (listFilter === "done") return doneOutbound;
    return outboundUnits;
  }, [listFilter, isExceptions, pendingOutbound, doneOutbound, outboundUnits]);

  const visibleReturn = useMemo(() => {
    if (listFilter === "remaining" || isExceptions) return pendingReturn;
    if (listFilter === "done") return doneReturn;
    return returnUnits;
  }, [listFilter, isExceptions, pendingReturn, doneReturn, returnUnits]);

  const outboundGroups = useMemo(() => {
    const map = new Map<string, OutboundUnit[]>();
    for (const unit of visibleOutbound) {
      const key = unit.label;
      const list = map.get(key) ?? [];
      list.push(unit);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [visibleOutbound]);

  function resetUiState() {
    setShowReceipt(false);
    setCompleteWarning(null);
    setListFilter("remaining");
    setPhase("pack");
    setLocalError(null);
  }

  async function ensureStarted() {
    setLocalError(null);
    try {
      if (direction === "outbound") {
        await startOutbound({ eventId });
      } else {
        await startReturn({ eventId });
      }
      setPhase("pack");
      setListFilter("remaining");
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
        const total = result.checkedOffCount + result.addedCount;
        onMessage?.(
          total > 1
            ? `${result.assetId}: checked ${total} (incl. contents)`
            : `Checked ${result.assetId}`,
        );
      } else {
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
    setCompleteWarning(null);
    if (direction === "outbound") {
      setShowReceipt(true);
    }
    try {
      if (direction === "outbound") {
        const result = await completeOutbound({ eventId });
        setPhase("pack");
        if (result.emailWarning) {
          setCompleteWarning(result.emailWarning);
          notify.warning(result.emailWarning);
        } else {
          onMessage?.(
            `Delivery complete. ${result.rentedCount} item(s) rented. Client notified.`,
          );
        }
      } else {
        const result = await completeReturn({ eventId });
        setPhase("pack");
        if (result.emailWarning) {
          setCompleteWarning(result.emailWarning);
          notify.warning(result.emailWarning);
        } else {
          onMessage?.("Return complete. Client notified.");
        }
        onOpenChange(false);
      }
    } catch (err) {
      if (direction === "outbound") {
        setShowReceipt(false);
      }
      const message = getConvexErrorMessage(err);
      setLocalError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  function requestComplete() {
    if (pendingCount > 0) {
      setPhase("exceptions");
      setListFilter("remaining");
      return;
    }
    void handleComplete();
  }

  async function handleResendClientEmail() {
    setBusy(true);
    setLocalError(null);
    try {
      const result =
        direction === "outbound"
          ? await resendOutboundClientEmail({ eventId })
          : await resendReturnClientEmail({ eventId });
      if (result.emailWarning) {
        setCompleteWarning(result.emailWarning);
        notify.warning(result.emailWarning);
      } else {
        setCompleteWarning(null);
        onMessage?.("Client notification sent.");
      }
    } catch (err) {
      const message = getConvexErrorMessage(err);
      setLocalError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  async function markAllRemainingNoTag() {
    setBusy(true);
    setLocalError(null);
    try {
      if (direction === "outbound") {
        await Promise.all(
          pendingOutbound.map((unit) =>
            setOutboundDisposition({ unitId: unit._id, status: "no_tag" }),
          ),
        );
      } else {
        await Promise.all(
          pendingReturn.map((unit) =>
            setReturnDisposition({ unitId: unit._id, status: "no_tag" }),
          ),
        );
      }
      onMessage?.(
        `Marked ${pendingCount} remaining item${pendingCount === 1 ? "" : "s"} as no tag.`,
      );
    } catch (err) {
      const message = getConvexErrorMessage(err);
      setLocalError(message);
      onError?.(message);
    } finally {
      setBusy(false);
    }
  }

  const title = direction === "outbound" ? "Process delivery" : "Process return";
  const completeLabel = direction === "outbound" ? "Complete delivery" : "Complete return";

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) resetUiState();
          onOpenChange(next);
        }}
      >
        <SheetContent
          side="right"
          className="w-full gap-0 p-0 sm:max-w-xl"
        >
          <SheetHeader className="shrink-0 border-b">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              {isExceptions
                ? "Resolve leftovers, then complete."
                : "Scan tags to check items off. Leftovers are handled when you complete."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col">
            {!inProgress && !showReceipt && !showCompletedReturn ? (
              <div className="space-y-3 p-4">
                {summary?.returnCompleted && direction === "return" ? (
                  <p className="text-sm text-muted-foreground">
                    Return already completed for this event.
                  </p>
                ) : outbound?.status === "completed" && direction === "outbound" ? (
                  <p className="text-sm text-muted-foreground">
                    Delivery already completed for this event.
                  </p>
                ) : (
                  <Button type="button" onClick={() => void ensureStarted()} disabled={busy}>
                    Start {direction === "outbound" ? "delivery" : "return"}
                  </Button>
                )}
              </div>
            ) : null}

            {inProgress || showCompletedOutbound || showCompletedReturn ? (
              <>
                <div className="shrink-0 space-y-3 border-b bg-popover px-4 py-3">
                  {inProgress ? (
                    <>
                      <div className="flex items-end justify-between gap-3">
                        <div>
                          <p className="text-2xl font-semibold tracking-tight tabular-nums">
                            {progressDone}
                            <span className="text-base font-normal text-muted-foreground">
                              {" "}
                              / {progressTotal}
                            </span>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {direction === "outbound" ? "Packed" : "Checked in"}
                            {pendingCount > 0 ? ` · ${pendingCount} remaining` : " · all clear"}
                          </p>
                        </div>
                        {clientNotify && !clientNotify.canNotify ? (
                          <p className="max-w-[12rem] text-right text-[11px] leading-snug text-amber-700 dark:text-amber-300">
                            No invoice client email — won’t notify on complete
                          </p>
                        ) : clientNotify?.email ? (
                          <p className="max-w-[12rem] truncate text-right text-[11px] text-muted-foreground">
                            Notify {clientNotify.email}
                          </p>
                        ) : null}
                      </div>
                      <ProgressBar value={progressDone} max={progressTotal || 1} />
                      {!isExceptions ? (
                        <FilterChips
                          value={listFilter}
                          onChange={setListFilter}
                          remainingCount={pendingCount}
                          doneCount={doneCount}
                        />
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                          <span>
                            {pendingCount} leftover{pendingCount === 1 ? "" : "s"} need a disposition
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy || pendingCount === 0}
                            onClick={() => void markAllRemainingNoTag()}
                          >
                            Mark all no tag
                          </Button>
                        </div>
                      )}
                      {!isExceptions ? (
                        <AssetScanner onSubmit={handleScan} disabled={busy} autoFocus />
                      ) : null}
                    </>
                  ) : null}

                  {localError ? <p className="text-sm text-destructive">{localError}</p> : null}
                  {completeWarning ? (
                    <p className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
                      {completeWarning}
                    </p>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  {direction === "outbound" && outbound && inProgress ? (
                    <div className="space-y-4">
                      {outboundGroups.map(([label, groupUnits]) => {
                        const need = outbound.needs.find((row) => row.label === label);
                        const groupDone = groupUnits.filter((u) => u.outboundStatus !== "pending")
                          .length;
                        const groupTotal = need?.quantityRequired ?? groupUnits.length;
                        return (
                          <div key={label} className="space-y-1.5">
                            <div className="flex items-baseline justify-between gap-2">
                              <h3 className="text-sm font-medium">{label}</h3>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {need
                                  ? `${need.quantityFulfilled}/${need.quantityRequired}`
                                  : `${groupDone}/${groupTotal}`}
                              </span>
                            </div>
                            <ul className="space-y-1">
                              {groupUnits.map((unit) => {
                                const isPending = unit.outboundStatus === "pending";
                                return (
                                  <li
                                    key={unit._id}
                                    className={cn(
                                      "flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm",
                                      isPending ? "bg-background" : "bg-muted/40 text-muted-foreground",
                                    )}
                                  >
                                    <div className="min-w-0">
                                      <div className="truncate">
                                        {isPending ? "○" : "✓"}{" "}
                                        {unit.assetId ?? (isPending ? "Awaiting scan" : unit.outboundStatus)}
                                      </div>
                                      {!isPending && unit.outboundStatus !== "scanned" ? (
                                        <div className="text-xs capitalize">{unit.outboundStatus.replace("_", " ")}</div>
                                      ) : null}
                                    </div>
                                    {isPending && isExceptions ? (
                                      <div className="flex shrink-0 flex-wrap gap-1">
                                        {(["replace", "no_tag", "removed"] as const).map((status) => (
                                          <Button
                                            key={status}
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            disabled={busy}
                                            onClick={() =>
                                              void setOutboundDisposition({
                                                unitId: unit._id,
                                                status,
                                              }).catch((err) =>
                                                setLocalError(getConvexErrorMessage(err)),
                                              )
                                            }
                                          >
                                            {status === "no_tag"
                                              ? "No tag"
                                              : status[0]!.toUpperCase() + status.slice(1)}
                                          </Button>
                                        ))}
                                      </div>
                                    ) : null}
                                    {isPending && !isExceptions ? (
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                          <Button
                                            type="button"
                                            size="icon-sm"
                                            variant="ghost"
                                            disabled={busy}
                                            aria-label={`Exceptions for ${unit.label}`}
                                          >
                                            <DotsThreeIcon />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end">
                                          {(["replace", "no_tag", "removed"] as const).map((status) => (
                                            <DropdownMenuItem
                                              key={status}
                                              onClick={() =>
                                                void setOutboundDisposition({
                                                  unitId: unit._id,
                                                  status,
                                                }).catch((err) =>
                                                  setLocalError(getConvexErrorMessage(err)),
                                                )
                                              }
                                            >
                                              {status === "no_tag"
                                                ? "No tag"
                                                : status[0]!.toUpperCase() + status.slice(1)}
                                            </DropdownMenuItem>
                                          ))}
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    ) : null}
                                    {!isPending ? (
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        disabled={busy}
                                        onClick={() =>
                                          void undoOutboundUnit({ unitId: unit._id }).catch((err) =>
                                            setLocalError(getConvexErrorMessage(err)),
                                          )
                                        }
                                      >
                                        Undo
                                      </Button>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })}
                      {!visibleOutbound.length ? (
                        <p className="text-sm text-muted-foreground">
                          {listFilter === "remaining"
                            ? "Nothing remaining — ready to complete."
                            : "No items in this filter."}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {direction === "return" && returnWs && inProgress ? (
                    <ul className="space-y-1.5">
                      {visibleReturn.map((unit) => {
                        const isPending = (unit.returnStatus ?? "pending") === "pending";
                        return (
                          <li
                            key={unit._id}
                            className={cn(
                              "flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-sm",
                              isPending ? "bg-background" : "bg-muted/40 text-muted-foreground",
                            )}
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-foreground">{unit.label}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {isPending ? "○" : "✓"} {unit.assetId ?? "No tag"}
                                {!isPending && unit.returnStatus
                                  ? ` · ${unit.returnStatus.replace("_", " ")}`
                                  : ""}
                              </div>
                            </div>
                            {isPending && isExceptions ? (
                              <div className="flex shrink-0 flex-wrap gap-1">
                                {(["no_tag", "missing", "manual"] as const).map((status) => (
                                  <Button
                                    key={status}
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() =>
                                      void setReturnDisposition({ unitId: unit._id, status }).catch(
                                        (err) => setLocalError(getConvexErrorMessage(err)),
                                      )
                                    }
                                  >
                                    {status === "no_tag"
                                      ? "No tag"
                                      : status[0]!.toUpperCase() + status.slice(1)}
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
                            ) : null}
                            {isPending && !isExceptions ? (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    size="icon-sm"
                                    variant="ghost"
                                    disabled={busy}
                                    aria-label={`Exceptions for ${unit.label}`}
                                  >
                                    <DotsThreeIcon />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {(["no_tag", "missing", "manual"] as const).map((status) => (
                                    <DropdownMenuItem
                                      key={status}
                                      onClick={() =>
                                        void setReturnDisposition({
                                          unitId: unit._id,
                                          status,
                                        }).catch((err) =>
                                          setLocalError(getConvexErrorMessage(err)),
                                        )
                                      }
                                    >
                                      {status === "no_tag"
                                        ? "No tag"
                                        : status[0]!.toUpperCase() + status.slice(1)}
                                    </DropdownMenuItem>
                                  ))}
                                  <DropdownMenuItem
                                    disabled={!unit.inventoryItemId}
                                    onClick={() => {
                                      if (!unit.inventoryItemId) return;
                                      setDamageForUnitId(unit._id);
                                      setDamageItemId(unit.inventoryItemId);
                                    }}
                                  >
                                    Damaged…
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            ) : null}
                            {!isPending ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={busy}
                                onClick={() =>
                                  void undoReturnUnit({ unitId: unit._id }).catch((err) =>
                                    setLocalError(getConvexErrorMessage(err)),
                                  )
                                }
                              >
                                Undo
                              </Button>
                            ) : null}
                          </li>
                        );
                      })}
                      {!visibleReturn.length ? (
                        <p className="text-sm text-muted-foreground">
                          {listFilter === "remaining"
                            ? "Nothing remaining — ready to complete."
                            : "No items in this filter."}
                        </p>
                      ) : null}
                    </ul>
                  ) : null}

                  {showCompletedOutbound ? (
                    <div className="space-y-2">
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
                </div>

                <SheetFooter className="shrink-0 border-t bg-popover">
                  {inProgress ? (
                    <div className="flex w-full flex-col gap-2">
                      {isExceptions && pendingCount === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Leftovers resolved. You can complete now.
                        </p>
                      ) : null}
                      {isExceptions && pendingCount > 0 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setPhase("pack")}
                        >
                          Back to scanning
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        className="w-full"
                        disabled={busy || (isExceptions && pendingCount > 0)}
                        onClick={() => requestComplete()}
                      >
                        {pendingCount > 0 && !isExceptions
                          ? `Resolve ${pendingCount} leftover${pendingCount === 1 ? "" : "s"}`
                          : completeLabel}
                      </Button>
                    </div>
                  ) : null}

                  {showCompletedOutbound || showCompletedReturn ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      disabled={busy || !clientNotify?.canNotify}
                      onClick={() => void handleResendClientEmail()}
                    >
                      {clientEmailAlreadyQueued ? "Resend client email" : "Send client email"}
                    </Button>
                  ) : null}
                </SheetFooter>
              </>
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
              setPhase("exceptions");
              setListFilter("remaining");
              onMessage?.("Damage reported and unit marked damaged.");
            })
            .catch((err) => setLocalError(getConvexErrorMessage(err)));
        }}
      />
    </>
  );
}
