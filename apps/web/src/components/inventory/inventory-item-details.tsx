"use client";

import type { Ref } from "react";
import { CameraIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  assetSearchVariants,
  looksLikeAssetTag,
  looksLikeSerialNumber,
  normalizeAssetScanInput,
} from "@/lib/asset-scan";
import { SearchableSelect } from "./searchable-select";
import { ScanInput } from "./scan-input";
import { BarcodeCameraView } from "./barcode-camera-view";
import { useBarcodeCamera, type ScanOutcome } from "./use-barcode-camera";

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
  /** Resolve `"rejected"` for an unknown code; the camera then stays open for another try. */
  onScanContainedIn?: (raw: string) => void | ScanOutcome | Promise<void | ScanOutcome>;
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
  const containerCamera = useBarcodeCamera((raw) => onScanContainedIn?.(raw));

  const assetLooksLikeSerial = looksLikeSerialNumber(values.assetId);
  const serialLooksLikeAssetTag = looksLikeAssetTag(values.serialNumber);
  // Distinct prefixes keep ids unique when two editors render at once.
  const idPrefix = testIdPrefix ?? "inventory-item";

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
          <Label htmlFor={`${idPrefix}-asset-id`}>Asset ID</Label>
          <ScanInput
            id={`${idPrefix}-asset-id`}
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
            <p className="text-xs text-status-amber-700">
              This looks like a serial number — did you mean the Serial field?
            </p>
          ) : null}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-serial-number`}>Serial Number</Label>
          <ScanInput
            id={`${idPrefix}-serial-number`}
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
            <p className="text-xs text-status-amber-700">
              This looks like an asset tag — did you mean the Asset ID field?
            </p>
          ) : null}
        </div>
      </div>

      {fixedTypeLabel ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Type</p>
          <div className="h-9 flex items-center rounded-none border border-input bg-muted/40 px-3 text-sm">
            {fixedTypeLabel}
          </div>
        </div>
      ) : (
        <div className="space-y-2" data-testid={testIdPrefix ? `${testIdPrefix}-type-field` : undefined}>
          <Label htmlFor={`${idPrefix}-type`}>Type</Label>
          <SearchableSelect
            id={`${idPrefix}-type`}
            value={values.typeId}
            onChange={(typeId) => onChange({ typeId })}
            options={types ?? []}
            placeholder="Search types..."
            emptyLabel="Select type"
          />
        </div>
      )}

      <div className="space-y-2" data-testid={testIdPrefix ? `${testIdPrefix}-location-field` : undefined}>
        <Label htmlFor={`${idPrefix}-storage-location`}>Storage Location</Label>
        <SearchableSelect
          id={`${idPrefix}-storage-location`}
          value={values.storageLocationId ?? ""}
          onChange={(storageLocationId) => onChange({ storageLocationId })}
          options={[{ value: "", label: "Unassigned" }, ...locations]}
          placeholder="Search storage locations..."
          emptyLabel="Unassigned"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-contained-in`}>Contained In Asset</Label>
        <div className="flex gap-1.5">
          <div
            className="min-w-0 flex-1"
            data-testid={testIdPrefix ? `${testIdPrefix}-container-field` : undefined}
          >
            <SearchableSelect
              id={`${idPrefix}-contained-in`}
              value={values.containedInAssetId ?? ""}
              onChange={(containedInAssetId) => onChange({ containedInAssetId })}
              options={[{ value: "", label: "Not contained" }, ...containerOptions]}
              placeholder="Search, or paste ALE-0041 / arbor.st/e/…"
              emptyLabel="Not contained"
              queryVariants={assetSearchVariants}
              onCreate={onScanContainedIn ? (query) => void onScanContainedIn(query) : undefined}
              createLabel="Look up"
            />
          </div>
          {onScanContainedIn && containerCamera.supported ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={containerCamera.cameraOn ? "Hide camera" : "Scan a container barcode"}
              aria-pressed={containerCamera.cameraOn}
              disabled={disabled}
              onClick={containerCamera.toggleCamera}
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

      <BarcodeCameraView camera={containerCamera} idleHint="Scan the container this sits in." />

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-status`}>Status</Label>
        <Input
          id={`${idPrefix}-status`}
          type="text"
          value={values.status}
          onChange={(event) => onChange({ status: event.target.value })}
          placeholder="e.g. functional, needs repair"
          disabled={disabled}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-notes`}>Notes</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          value={values.notes}
          onChange={(event) => onChange({ notes: event.target.value })}
          placeholder="Optional details"
          disabled={disabled}
          className="min-h-20"
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
