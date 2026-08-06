"use client";

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

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
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
