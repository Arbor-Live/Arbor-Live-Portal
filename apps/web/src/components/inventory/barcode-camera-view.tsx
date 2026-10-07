"use client";

import { FlashlightIcon, SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react";
import { describeScan } from "@/lib/asset-scan";
import { cn } from "@/lib/utils";
import type { BarcodeCamera } from "./use-barcode-camera";

const overlayButtonClassName =
  "flex size-8 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80";

/**
 * The live preview for a `useBarcodeCamera` session: the video with an aiming
 * frame, a green / red flash per read, flashlight and sound toggles, a lens
 * picker when the phone has more than one back camera, and a confirmation of
 * the last read. Renders nothing while closed.
 */
export function BarcodeCameraView({
  camera,
  idleHint = "Point the camera at a QR code or barcode. It stays open between scans.",
  testId,
}: {
  camera: BarcodeCamera;
  /** Shown until the first read. */
  idleHint?: string;
  testId?: string;
}) {
  const {
    cameraOn,
    cameraError,
    videoRef,
    lenses,
    activeLensId,
    selectLens,
    lastDetected,
    feedback,
    scanCount,
    muted,
    toggleMuted,
    torchSupported,
    torchOn,
    toggleTorch,
  } = camera;
  return (
    <>
      {cameraError ? <p className="text-xs text-destructive">{cameraError}</p> : null}
      {cameraOn ? (
        <div className="space-y-1.5">
          <div className="relative overflow-hidden rounded-md">
            <video ref={videoRef} className="aspect-video w-full bg-black object-cover" muted playsInline />
            {/* Aiming frame: wide enough for a 1D barcode, tall enough for a QR. */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-1/8 inset-y-1/6 rounded-md border-2 border-white/70 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
            />
            {feedback ? (
              <div
                key={feedback.id}
                aria-hidden
                data-testid="barcode-camera-flash"
                data-kind={feedback.kind}
                className={cn(
                  "pointer-events-none absolute inset-0 rounded-md border-4 animate-out fade-out fill-mode-forwards duration-700",
                  feedback.kind === "accepted"
                    ? "border-status-emerald-500 bg-status-emerald-500/20"
                    : "border-status-red-500 bg-status-red-500/20",
                )}
              />
            ) : null}
            <div className="absolute top-2 right-2 flex gap-1.5">
              {torchSupported ? (
                <button
                  type="button"
                  aria-label={torchOn ? "Turn flashlight off" : "Turn flashlight on"}
                  aria-pressed={torchOn}
                  onClick={toggleTorch}
                  className={cn(overlayButtonClassName, torchOn && "bg-white text-black hover:bg-white")}
                >
                  <FlashlightIcon className="size-4" weight={torchOn ? "fill" : "regular"} />
                </button>
              ) : null}
              <button
                type="button"
                aria-label={muted ? "Turn scan sound on" : "Mute scan sound"}
                aria-pressed={!muted}
                onClick={toggleMuted}
                className={overlayButtonClassName}
              >
                {muted ? <SpeakerSlashIcon className="size-4" /> : <SpeakerHighIcon className="size-4" />}
              </button>
            </div>
            {lenses.length > 1 ? (
              <div
                className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1 rounded-full bg-black/60 p-1"
                role="group"
                aria-label="Camera lens"
              >
                {lenses.map((lens) => (
                  <button
                    key={lens.deviceId}
                    type="button"
                    aria-pressed={lens.deviceId === activeLensId}
                    onClick={() => selectLens(lens.deviceId)}
                    className={cn(
                      "min-w-10 rounded-full px-2.5 py-1 text-xs font-medium text-white transition-colors",
                      lens.deviceId === activeLensId ? "bg-white text-black" : "hover:bg-white/20",
                    )}
                  >
                    {lens.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground" aria-live="polite" data-testid={testId}>
            {lastDetected ? (
              <>
                Read <span className="font-medium text-foreground">{describeScan(lastDetected)}</span>
                {scanCount > 1 ? ` · ${scanCount} scanned` : null}. Scan the next one, or hide the camera
                when you&apos;re done.
              </>
            ) : (
              idleHint
            )}
          </p>
        </div>
      ) : null}
    </>
  );
}
