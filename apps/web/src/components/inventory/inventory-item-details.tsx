"use client";

import type { Ref } from "react";
import { CameraIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  looksLikeAssetTag,
  looksLikeSerialNumber,
  normalizeAssetScanInput,
} from "@/lib/asset-scan";
import { cn } from "@/lib/utils";
import { SearchableSelect } from "./searchable-select";
import { ScanInput } from "./scan-input";
import { useBarcodeCamera } from "./use-barcode-camera";

export type ItemDetailsValues = {
  assetId: string;
  serialNumber: string;
  typeId: string;
  storageLocationId: string;
  containedInAssetId: string;
  status: string;
  notes: string;
};

export type ItemDetailsOption = {
  value: string;
  label: string;
};

export type ItemDetailsContainerOption = {
  value: string;
  assetId: string;
  label: string;
};

type InventoryItemDetailsProps = {
  values: ItemDetailsValues;
  onChange: (patch: Partial<ItemDetailsValues>) => void;
  errors?: { assetId?: string; containedInAssetId?: string };
  /** Type options; ignored when `fixedTypeLabel` is set (type locked upstream). */
  types?: ItemDetailsOption[];
  fixedTypeLabel?: string;
  locations: ItemDetailsOption[];
  containerOptions: ItemDetailsContainerOption[];
  /** Fired with the raw scan when the operator uses the asset-id camera. */
  onScanAssetId?: (raw: string) => void;
  onScanSerial?: (raw: string) => void;
  onScanContainedIn?: (raw: string) => void;
  /** Enter on Asset ID — wizard advances to serial. */
  onEnterAssetId?: () => void;
  /** Enter on Serial — wizard creates the next asset card. */
  onEnterSerial?: () => void;
  assetIdInputRef?: Ref<HTMLInputElement>;
  serialInputRef?: Ref<HTMLInputElement>;
  autoFocusAssetId?: boolean;
  /** When set, renders the testid-wrapped fields the item editor's e2e relies on. */
  testIdPrefix?: string;
  siteBase?: string;
  disabled?: boolean;
};

const textareaClassName =
  "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive";

/**
 * The per-item editor shared by the create-asset wizard and the item editor —
 * "what shows in the edit section". Controlled: the parent owns `values` and
 * folds camera reads into `onChange` via the optional `onScan*` handlers.
 */
export function InventoryItemDetails({
  values,
  onChange,
  errors,
  types,
  fixedTypeLabel,
  locations,
  containerOptions,
  onScanAssetId,
  onScanSerial,
  onScanContainedIn,
  onEnterAssetId,
  onEnterSerial,
  assetIdInputRef,
  serialInputRef,
  autoFocusAssetId,
  testIdPrefix,
  siteBase,
  disabled,
}: InventoryItemDetailsProps) {
  const { cameraOn, toggleCamera, cameraError, videoRef, supported } = useBarcodeCamera(
    (raw) => void onScanContainedIn?.(raw),
    { closeOnDetect: true },
  );

  const assetLooksLikeSerial = looksLikeSerialNumber(values.assetId);
  const serialLooksLikeAssetTag = looksLikeAssetTag(values.serialNumber);

  function handleAssetIdScan(raw: string) {
    if (onScanAssetId) {
      onScanAssetId(raw);
      return;
    }
    onChange({ assetId: normalizeAssetScanInput(raw) ?? "" });
  }

  function handleSerialScan(raw: string) {
    if (onScanSerial) {
      onScanSerial(raw);
      return;
    }
    onChange({ serialNumber: raw.trim() });
  }

  function handleAssetIdBlur() {
    const normalized = normalizeAssetScanInput(values.assetId);
    if (normalized && normalized !== values.assetId) {
      onChange({ assetId: normalized });
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Asset ID</Label>
          <ScanInput
            value={values.assetId}
            onChange={(assetId) => onChange({ assetId })}
            onScan={handleAssetIdScan}
            onBlur={handleAssetIdBlur}
            onEnter={onEnterAssetId}
            inputRef={assetIdInputRef}
            autoFocus={autoFocusAssetId}
            placeholder="e.g. ALE-0041"
            disabled={disabled}
            ariaLabel="Asset ID"
          />
          {errors?.assetId ? (
            <p className="text-xs text-destructive">{errors.assetId}</p>
          ) : null}
          {assetLooksLikeSerial ? (
            <p className="text-xs text-amber-700">
              This looks like a serial number — did you mean the Serial field?
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label>Serial Number</Label>
          <ScanInput
            value={values.serialNumber}
            onChange={(serialNumber) => onChange({ serialNumber })}
            onScan={handleSerialScan}
            onEnter={onEnterSerial}
            inputRef={serialInputRef}
            placeholder="Scan or type serial"
            disabled={disabled}
            ariaLabel="Serial Number"
          />
          {serialLooksLikeAssetTag ? (
            <p className="text-xs text-amber-700">
              This looks like an asset tag — did you mean the Asset ID field?
            </p>
          ) : null}
        </div>
      </div>

      {fixedTypeLabel ? (
        <div className="space-y-1.5">
          <Label>Type</Label>
          <div className="h-9 flex items-center rounded-none border border-input bg-muted/40 px-3 text-sm">
            {fixedTypeLabel}
          </div>
        </div>
      ) : (
        <div className="space-y-2" data-testid={testIdPrefix ? `${testIdPrefix}-type-field` : undefined}>
          <Label>Type</Label>
          <SearchableSelect
            value={values.typeId}
            onChange={(typeId) => onChange({ typeId })}
            options={types ?? []}
            placeholder="Search types..."
            emptyLabel="Select type"
          />
        </div>
      )}

      <div className="space-y-2" data-testid={testIdPrefix ? `${testIdPrefix}-location-field` : undefined}>
        <Label>Storage Location</Label>
        <SearchableSelect
          value={values.storageLocationId ?? ""}
          onChange={(storageLocationId) => onChange({ storageLocationId })}
          options={[{ value: "", label: "Unassigned" }, ...locations]}
          placeholder="Search storage locations..."
          emptyLabel="Unassigned"
        />
      </div>

      <div className="space-y-2">
        <Label>Contained In Asset</Label>
        <div className="flex gap-1.5">
          <div
            className="min-w-0 flex-1"
            data-testid={testIdPrefix ? `${testIdPrefix}-container-field` : undefined}
          >
            <SearchableSelect
              value={values.containedInAssetId ?? ""}
              onChange={(containedInAssetId) => onChange({ containedInAssetId })}
              options={[{ value: "", label: "Not contained" }, ...containerOptions]}
              placeholder="Search container assets..."
              emptyLabel="Not contained"
            />
          </div>
          {onScanContainedIn && supported ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Scan a container barcode"
              disabled={disabled}
              onClick={toggleCamera}
              className="shrink-0"
            >
              <CameraIcon className="size-4" />
            </Button>
          ) : null}
        </div>
        {errors?.containedInAssetId ? (
          <p className="text-xs text-destructive">{errors.containedInAssetId}</p>
        ) : null}
      </div>

      {cameraError ? <p className="text-xs text-destructive">{cameraError}</p> : null}
      {cameraOn ? (
        <video
          ref={videoRef}
          className="aspect-video w-full rounded-md bg-black object-cover"
          muted
          playsInline
        />
      ) : null}

      <div className="space-y-1.5">
        <Label>Status</Label>
        <input
          type="text"
          value={values.status}
          onChange={(event) => onChange({ status: event.target.value })}
          placeholder="e.g. functional, needs repair"
          disabled={disabled}
          className={cn(textareaClassName, "min-h-0")}
          aria-label="Status"
        />
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <textarea
          value={values.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          placeholder="Optional details"
          disabled={disabled}
          className={cn(textareaClassName, "min-h-20")}
          aria-label="Notes"
        />
      </div>

      {siteBase ? (
        <p className="text-xs text-muted-foreground">
          Public finder URL:{" "}
          <span className="font-mono">
            {siteBase}/e/{values.assetId || "ASSETID"}
          </span>
        </p>
      ) : null}
    </div>
  );
}
