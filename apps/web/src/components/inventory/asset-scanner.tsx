"use client";

import { useState } from "react";
import { CameraIcon, KeyboardIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBarcodeCamera, type ScanOutcome } from "./use-barcode-camera";

type AssetScannerProps = {
  /** Resolve `false` when the scan failed (the caller shows why). */
  onSubmit: (raw: string) => void | boolean | Promise<void | boolean>;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  /**
   * Keep the camera open after each read, for scanning a batch of assets in a
   * row (checking gear out or back in). Off by default: a single lookup closes
   * the camera once it has a code.
   */
  keepCameraOpen?: boolean;
};

export function AssetScanner({
  onSubmit,
  disabled,
  placeholder = "Scan or type ALE-0041 / arbor.st/e/…",
  autoFocus,
  keepCameraOpen = false,
}: AssetScannerProps) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const { cameraOn, toggleCamera, cameraError, videoRef, supported, lastDetected } =
    useBarcodeCamera(handleSubmit, { closeOnDetect: !keepCameraOpen });

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
          className="flex gap-2"
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
          <Button type="submit" disabled={disabled || busy || !value.trim()}>
            Add
          </Button>
        </form>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={toggleCamera}>
          {cameraOn ? <KeyboardIcon className="size-4" /> : <CameraIcon className="size-4" />}
          {cameraOn ? "Hide camera" : supported ? "Use camera" : "Camera unavailable"}
        </Button>
      </div>
      {cameraError ? <p className="text-sm text-destructive">{cameraError}</p> : null}
      {cameraOn ? (
        <video
          ref={videoRef}
          className="aspect-video w-full rounded-md bg-black object-cover"
          muted
          playsInline
        />
      ) : null}
      {cameraOn && keepCameraOpen ? (
        <p className="text-xs text-muted-foreground" aria-live="polite" data-testid="asset-scanner-last">
          {lastDetected
            ? `Read ${lastDetected}. Keep scanning, or hide the camera when you're done.`
            : "The camera stays open, so you can scan one asset after another."}
        </p>
      ) : null}
    </div>
  );
}
