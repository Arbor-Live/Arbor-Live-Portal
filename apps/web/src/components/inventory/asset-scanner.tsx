"use client";

import { useState } from "react";
import { CameraIcon, KeyboardIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBarcodeCamera } from "./use-barcode-camera";

type AssetScannerProps = {
  onSubmit: (raw: string) => void | Promise<void>;
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
  const { cameraOn, toggleCamera, cameraError, videoRef, supported } =
    useBarcodeCamera(handleSubmit, { closeOnDetect: true });

  async function handleSubmit(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed || busy || disabled) return;
    setBusy(true);
    try {
      await onSubmit(trimmed);
      setValue("");
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
    </div>
  );
}
