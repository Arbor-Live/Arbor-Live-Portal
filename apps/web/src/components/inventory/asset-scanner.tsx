"use client";

import { useState } from "react";
import { CameraIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarcodeCameraView } from "./barcode-camera-view";
import { useBarcodeCamera, type ScanOutcome } from "./use-barcode-camera";

type AssetScannerProps = {
  /** Resolve `false` when the scan failed (the caller shows why). */
  onSubmit: (raw: string) => void | boolean | Promise<void | boolean>;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
};

export function AssetScanner({
  onSubmit,
  disabled,
  placeholder = "Scan or type ALE-0041 / arbor.st/e/…",
  autoFocus,
}: AssetScannerProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  // The camera stays open between reads, so a run of assets scans back to back.
  const camera = useBarcodeCamera(handleSubmit);
  const { cameraOn, toggleCamera, supported } = camera;

  async function handleSubmit(raw: string): Promise<ScanOutcome> {
    const trimmed = raw.trim();
    if (!trimmed || busy || disabled) return "dropped";
    setBusy(true);
    try {
      const ok = await onSubmit(trimmed);
      if (ok === false) return "rejected";
      // Keep typed text after a failure so it can be corrected.
      setValue("");
      return "accepted";
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="asset-scan-input">Scan asset</Label>
        <form
          className="flex gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit(value);
          }}
        >
          <Input
            id="asset-scan-input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            disabled={disabled || busy}
            autoFocus={autoFocus}
            autoComplete="off"
          />
          {supported ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={cameraOn ? "Hide camera" : "Scan with camera"}
              aria-pressed={cameraOn}
              disabled={disabled}
              onClick={toggleCamera}
              className="shrink-0"
            >
              <CameraIcon className="size-4" />
            </Button>
          ) : null}
          <Button type="submit" disabled={disabled || busy || !value.trim()}>
            Add
          </Button>
        </form>
      </div>
      <BarcodeCameraView
        camera={camera}
        idleHint="The camera stays open, so you can scan one asset after another."
        testId="asset-scanner-last"
      />
    </div>
  );
}
