"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import {
  claimBarcodeCameraSession,
  getActiveBarcodeCameraSession,
  releaseBarcodeCameraSession,
  subscribeBarcodeCameraSession,
} from "./barcode-camera-session";

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

const scanFormats = ["qr_code", "code_128", "code_39", "ean_13", "upc_a"];

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
 * True when live camera scanning can work. Chrome/Edge/Android expose the
 * native `BarcodeDetector`; Safari does not, so we fall back to a bundled JS
 * decoder (`@zxing/browser`), which only needs `getUserMedia`.
 */
function canUseCameraScanner() {
  if (typeof window === "undefined") return false;
  return Boolean(getBarcodeDetector()) || Boolean(navigator.mediaDevices?.getUserMedia);
}

/**
 * Live camera barcode/QR scanning loop. On every detected code, `onDetect` is
 * awaited with the raw value; repeated scans of the same value within 2s are
 * suppressed so a held-up label fires once. Shared by the scan inputs and the
 * asset scanner so camera handling lives in exactly one place.
 *
 * Only one camera session is active app-wide: opening a new one closes others.
 * Pass `closeOnDetect: true` for single-field scanners so the preview shuts
 * after a successful read.
 *
 * Uses the native `BarcodeDetector` where available and `@zxing/browser`
 * everywhere else (Safari / iOS), so the same component works on an iPhone.
 */
export function useBarcodeCamera(
  onDetect: (raw: string) => void | Promise<void>,
  options?: { closeOnDetect?: boolean },
) {
  const sessionId = useId();
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const onDetectRef = useRef(onDetect);
  const closeOnDetectRef = useRef(Boolean(options?.closeOnDetect));

  useEffect(() => {
    onDetectRef.current = onDetect;
  });

  useEffect(() => {
    closeOnDetectRef.current = Boolean(options?.closeOnDetect);
  }, [options?.closeOnDetect]);

  const supported = canUseCameraScanner();

  useEffect(() => {
    return subscribeBarcodeCameraSession(() => {
      if (getActiveBarcodeCameraSession() !== sessionId) {
        setCameraOn(false);
        setCameraError(null);
      }
    });
  }, [sessionId]);

  useEffect(() => {
    return () => {
      releaseBarcodeCameraSession(sessionId);
    };
  }, [sessionId]);

  function closeCamera() {
    releaseBarcodeCameraSession(sessionId);
    setCameraOn(false);
    setCameraError(null);
  }

  function toggleCamera() {
    if (cameraOn) {
      closeCamera();
      return;
    }
    if (!canUseCameraScanner()) {
      setCameraError("Camera barcode scanning is not supported in this browser. Use the text box.");
      return;
    }
    setCameraError(null);
    claimBarcodeCameraSession(sessionId);
    setCameraOn(true);
  }

  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;
    const Detector = getBarcodeDetector();
    let controls: IScannerControls | null = null;

    /** De-dupe and forward a raw scan to the caller. */
    async function handleRaw(value: string) {
      const raw = value.trim();
      if (!raw) return;
      const now = Date.now();
      if (raw === lastScanRef.current.value && now - lastScanRef.current.at <= 2000) {
        return;
      }
      lastScanRef.current = { value: raw, at: now };
      await onDetectRef.current(raw);
      if (closeOnDetectRef.current && !cancelled) {
        releaseBarcodeCameraSession(sessionId);
        setCameraOn(false);
        setCameraError(null);
      }
    }

    async function startNative() {
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
        formats: scanFormats,
      });
      const tick = async () => {
        if (cancelled || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          await handleRaw(codes[0]?.rawValue ?? "");
        } catch {
          // keep scanning
        }
        if (!cancelled) {
          window.setTimeout(tick, 350);
        }
      };
      void tick();
    }

    /**
     * Safari has no `BarcodeDetector`, so scan frames with ZXing. The reader
     * owns getUserMedia, the preview, and the decode loop; `controls.stop()`
     * tears it all down.
     */
    async function startFallback(): Promise<IScannerControls | null> {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      const reader = new BrowserMultiFormatReader();
      const video = videoRef.current;
      if (!video) return null;
      const started = await reader.decodeFromConstraints(
        {
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        },
        video,
        (result) => {
          if (result) void handleRaw(result.getText());
        },
      );
      if (cancelled) {
        started.stop();
        return null;
      }
      return started;
    }

    async function start() {
      try {
        if (Detector) {
          await startNative();
        } else {
          controls = await startFallback();
        }
      } catch {
        if (!cancelled) {
          setCameraError("Could not access the camera. Use the text box instead.");
          releaseBarcodeCameraSession(sessionId);
          setCameraOn(false);
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      controls?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cameraOn, sessionId]);

  return { cameraOn, toggleCamera, closeCamera, cameraError, videoRef, supported };
}
