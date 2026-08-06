"use client";

import { useMemo } from "react";
import { CameraIcon, XIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "./searchable-select";
import { useBarcodeCamera } from "./use-barcode-camera";

export type ContainsOption = {
  value: string;
  assetId: string;
  label?: string;
};

type ContainsEditorProps = {
  value: string[];
  onChange: (value: string[]) => void;
  /** Everything that may still be added. Selected values are filtered out. */
  options: ContainsOption[];
  /** Fired with the raw scanned/typed value when the operator uses the camera. */
  onScan?: (raw: string) => void | Promise<void>;
  title?: string;
  emptyLabel?: string;
  disabled?: boolean;
};

/**
 * A contained-assets list: chips of what sits inside a container, an add
 * dropdown of the remaining options, and an optional camera to scan a barcode.
 * The parent owns the semantics of `value` (assetIds in the wizard, _ids in
 * the item editor).
 */
export function ContainsEditor({
  value,
  onChange,
  options,
  onScan,
  title = "Contains",
  emptyLabel = "Nothing inside yet",
  disabled,
}: ContainsEditorProps) {
  const available = useMemo(() => {
    const selected = new Set(value);
    return options.filter((option) => !selected.has(option.value));
  }, [options, value]);
  const { cameraOn, toggleCamera, cameraError, videoRef, supported } = useBarcodeCamera(
    (raw) => void onScan?.(raw),
    { closeOnDetect: true },
  );

  const selectedOptions = useMemo(() => {
    const byValue = new Map(options.map((option) => [option.value, option]));
    return value.map((id) => byValue.get(id)).filter(Boolean);
  }, [options, value]);

  return (
    <div className="space-y-2">
      <Label>{title}</Label>
      {selectedOptions.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedOptions.map((option) => (
            <span
              key={option!.value}
              className="inline-flex items-center gap-1.5 rounded-none border px-2 py-0.5 text-xs"
            >
              {option!.assetId}
              {option!.label ? (
                <span className="text-muted-foreground">· {option!.label}</span>
              ) : null}
              <button
                type="button"
                aria-label={`Remove ${option!.assetId} from ${title.toLowerCase()}`}
                disabled={disabled}
                onClick={() => onChange(value.filter((id) => id !== option!.value))}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      )}
      <div className="flex gap-1.5">
        <div className="min-w-0 flex-1">
          <SearchableSelect
            value=""
            onChange={(next) => onChange([...value, next])}
            options={available.map((option) => ({
              value: option.value,
              label: option.assetId,
              description: option.label,
            }))}
            placeholder="Add an asset…"
            emptyLabel={available.length ? "Add an asset…" : "No more assets to add"}
          />
        </div>
        {onScan && supported ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Scan a barcode to add"
            disabled={disabled}
            onClick={toggleCamera}
            className="shrink-0"
          >
            <CameraIcon className="size-4" />
          </Button>
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
    </div>
  );
}
