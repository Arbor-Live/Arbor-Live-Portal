"use client";

import type { KeyboardEvent, Ref } from "react";
import { CameraIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useBarcodeCamera } from "./use-barcode-camera";

type ScanInputProps = {
  value: string;
  onChange: (value: string) => void;
  /** Called with the raw detected code when the camera reads a barcode/QR. */
  onScan?: (raw: string) => void | Promise<void>;
  onBlur?: () => void;
  /** Enter (or keypad Enter) — used by the create-asset wizard scan flow. */
  onEnter?: () => void;
  inputRef?: Ref<HTMLInputElement>;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  ariaLabel?: string;
  className?: string;
  showCameraButton?: boolean;
};

/**
 * A plain text input with an optional camera barcode/QR button. Typing works
 * like any input; `onScan` fires when the camera reads a code — the parent
 * decides how to fold the raw value into `onChange`. When `onScan` is omitted,
 * the trimmed raw value is written through `onChange`.
 */
export function ScanInput({
  value,
  onChange,
  onScan,
  onBlur,
  onEnter,
  inputRef,
  placeholder,
  disabled,
  autoFocus,
  ariaLabel,
  className,
  showCameraButton = true,
}: ScanInputProps) {
  const { cameraOn, toggleCamera, cameraError, videoRef, supported } = useBarcodeCamera(
    (raw) => {
      if (onScan) {
        void onScan(raw);
        return;
      }
      onChange(raw.trim());
    },
    { closeOnDetect: true },
  );

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    if (!onEnter) return;
    event.preventDefault();
    onEnter();
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Input
          ref={inputRef}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          aria-label={ariaLabel}
          className={className}
        />
        {showCameraButton && supported ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Scan with camera"
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
