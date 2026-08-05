"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

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
 * Uses the native `BarcodeDetector` where available and `@zxing/browser`
 * everywhere else (Safari / iOS), so the same component works on an iPhone.
 */
export function useBarcodeCamera(onDetect: (raw: string) => void | Promise<void>) {
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const torchTrackRef = useRef<MediaStreamTrack | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const onDetectRef = useRef(onDetect);

  useEffect(() => {
    onDetectRef.current = onDetect;
  });

  const supported = canUseCameraScanner();

  /** Remember the active video track and detect whether its flash is controllable. */
  function setCameraStream(stream: MediaStream) {
    streamRef.current = stream;
    const track = stream.getVideoTracks()[0] ?? null;
    torchTrackRef.current = track;
    // `torch` is a live-spec member not yet in lib.dom for capabilities.
    const torchCapable = Boolean(
      (track?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch,
    );
    setTorchSupported(torchCapable);
    if (!torchCapable) setTorchOn(false);
  }

  async function toggleTorch() {
    const track = torchTrackRef.current;
    if (!track || !torchSupported) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next }] as unknown as MediaTrackConstraintSet[],
      });
      setTorchOn(next);
    } catch {
      // The camera/device refused the torch change — leave the state as-is.
    }
  }

  function toggleCamera() {
    if (cameraOn) {
      setCameraOn(false);
      setCameraError(null);
      setTorchOn(false);
      setTorchSupported(false);
      torchTrackRef.current = null;
      return;
    }
    if (!canUseCameraScanner()) {
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
      setCameraStream(stream);
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
      if (video.srcObject instanceof MediaStream) {
        setCameraStream(video.srcObject);
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
      torchTrackRef.current = null;
      setTorchOn(false);
      setTorchSupported(false);
    };
  }, [cameraOn]);

  return { cameraOn, toggleCamera, cameraError, videoRef, supported, torchOn, torchSupported, toggleTorch };
}
