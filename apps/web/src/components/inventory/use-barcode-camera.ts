"use client";

import { useEffect, useRef, useState } from "react";

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

/**
 * Live camera barcode/QR scanning loop. On every detected code, `onDetect` is
 * awaited with the raw value; repeated scans of the same value within 2s are
 * suppressed so a held-up label fires once. Shared by the scan inputs and the
 * asset scanner so camera handling lives in exactly one place.
 */
export function useBarcodeCamera(onDetect: (raw: string) => void | Promise<void>) {
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const onDetectRef = useRef(onDetect);

  useEffect(() => {
    onDetectRef.current = onDetect;
  });

  const supported = typeof window !== "undefined" && Boolean(getBarcodeDetector());

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
                await onDetectRef.current(raw);
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
  }, [cameraOn]);

  return { cameraOn, toggleCamera, cameraError, videoRef, supported };
}
