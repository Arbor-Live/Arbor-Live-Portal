"use client";

import { useEffect, useRef, useState } from "react";
import { CameraIcon, KeyboardIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type AssetScannerProps = {
  onSubmit: (raw: string) => void | Promise<void>;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

function getBarcodeDetector():
  | (new (options?: { formats?: string[] }) => BarcodeDetectorLike)
  | null {
  if (typeof window === "undefined") return null;
  const ctor = (
    window as Window & {
      BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeDetectorLike;
    }
  ).BarcodeDetector;
  return ctor ?? null;
}

export function AssetScanner({
  onSubmit,
  disabled,
  placeholder = "Scan or type ALE-0041 / arbor.st/e/…",
  autoFocus,
}: AssetScannerProps) {
  const [value, setValue] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const cameraSupported = typeof window !== "undefined" && Boolean(getBarcodeDetector());

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

  function toggleCamera() {
    if (cameraOn) {
      setCameraOn(false);
      setCameraError(null);
      return;
    }
    if (!getBarcodeDetector()) {
      setCameraError("Camera barcode scanning is not supported in this browser. Use the text box.");
      return;
    }
    setCameraError(null);
    setCameraOn(true);
  }

  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;
    const Detector = getBarcodeDetector();
    if (!Detector) return;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
        const detector = new Detector!({
          formats: ["qr_code", "code_128", "code_39", "ean_13", "upc_a"],
        });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const raw = codes[0]?.rawValue?.trim();
            if (raw) {
              const now = Date.now();
              if (
                raw !== lastScanRef.current.value ||
                now - lastScanRef.current.at > 2000
              ) {
                lastScanRef.current = { value: raw, at: now };
                await handleSubmit(raw);
              }
            }
          } catch {
            // keep scanning
          }
          if (!cancelled) {
            window.setTimeout(tick, 350);
          }
        };
        tick();
      } catch {
        if (!cancelled) {
          setCameraError("Could not access the camera. Use the text box instead.");
          setCameraOn(false);
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- restart only when camera toggled
  }, [cameraOn]);

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
          {cameraOn ? "Hide camera" : cameraSupported ? "Use camera" : "Camera unavailable"}
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
