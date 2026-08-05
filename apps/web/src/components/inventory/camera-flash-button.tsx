"use client";

import { FlashlightIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

type CameraFlashButtonProps = {
  torchOn: boolean;
  torchSupported: boolean;
  onToggle: () => void;
};

/**
 * Flash on/off for the camera scanner. Only renders where the active camera
 * track exposes torch control (e.g. Android Chrome, some laptop webcams);
 * iOS Safari has no web API for the flash, so nothing shows there.
 */
export function CameraFlashButton({ torchOn, torchSupported, onToggle }: CameraFlashButtonProps) {
  if (!torchSupported) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={torchOn ? "Turn flash off" : "Turn flash on"}
      aria-pressed={torchOn}
      onClick={onToggle}
    >
      <FlashlightIcon weight={torchOn ? "fill" : "regular"} className="size-4" />
    </Button>
  );
}
