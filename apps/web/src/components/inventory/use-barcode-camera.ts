"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import type { DecodeHintType as DecodeHint } from "@zxing/library";
import {
  claimBarcodeCameraSession,
  getActiveBarcodeCameraSession,
  releaseBarcodeCameraSession,
  subscribeBarcodeCameraSession,
} from "./barcode-camera-session";
import {
  playScanSound,
  readScanSoundMuted,
  unlockScanSound,
  writeScanSoundMuted,
} from "./scan-feedback";

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorCtor = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

/** QR labels plus the 1D / 2D codes printed on gear (serials, UPCs, Data Matrix). */
const scanFormats = [
  "qr_code",
  "data_matrix",
  "aztec",
  "pdf417",
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "itf",
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
];

/** Remembers the lens picked on this device, so the close-up lens is one tap, once. */
const LENS_STORAGE_KEY = "arbor.barcodeCamera.deviceId";

function getBarcodeDetector(): BarcodeDetectorCtor | null {
  if (typeof window === "undefined") return null;
  const ctor = (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
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

function readStoredLens(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LENS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredLens(deviceId: string | null) {
  try {
    if (deviceId) window.localStorage.setItem(LENS_STORAGE_KEY, deviceId);
    else window.localStorage.removeItem(LENS_STORAGE_KEY);
  } catch {
    // private mode: the pick just isn't remembered
  }
}

export type CameraLens = { deviceId: string; label: string };

/** The ultra wide lens: the only one on an iPhone that focuses on a label held close. */
const CLOSE_UP_LENS_LABEL = "0.5×";

/** Short names for iOS's back cameras ("Back Ultra Wide Camera", …), as in the Camera app. */
function lensName(label: string, index: number): { label: string; rank: number } {
  if (/ultra\s*wide/i.test(label)) return { label: CLOSE_UP_LENS_LABEL, rank: 0 };
  if (/telephoto/i.test(label)) return { label: "Zoom", rank: 4 };
  if (/triple|dual/i.test(label)) return { label: "Auto", rank: 2 };
  if (/^back camera$/i.test(label.trim())) return { label: "1×", rank: 1 };
  return { label: label.trim() || `Camera ${index + 1}`, rank: 3 };
}

/** The back cameras to offer, best for close scanning first. Labels need camera permission. */
async function listCameraLenses(): Promise<CameraLens[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter(
    (device) => device.kind === "videoinput" && device.deviceId,
  );
  const back = devices.filter((device) => /back|rear|environment/i.test(device.label));
  const candidates = back.length ? back : devices;
  return candidates
    .map((device, index) => ({ deviceId: device.deviceId, ...lensName(device.label, index) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ deviceId, label }) => ({ deviceId, label }));
}

/**
 * The default stream is 640×480 on iPhone, too coarse to read a label unless
 * it's held close enough to force a slow lens switch. Ask for 1080p so a code
 * reads from a comfortable distance, and keep autofocus continuous.
 */
async function openCameraStream(deviceId: string | null): Promise<MediaStream> {
  const video: MediaTrackConstraints = {
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    ...(deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: "environment" } }),
  };
  const stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
  const track = stream.getVideoTracks()[0];
  const capabilities = track?.getCapabilities?.() as { focusMode?: string[] } | undefined;
  if (track && capabilities?.focusMode?.includes("continuous")) {
    await track
      .applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] })
      .catch(() => undefined);
  }
  return stream;
}

async function createNativeDetector(Detector: BarcodeDetectorCtor) {
  const supported = await Detector.getSupportedFormats?.().catch(() => null);
  const formats = supported ? scanFormats.filter((format) => supported.includes(format)) : scanFormats;
  return new Detector({ formats: formats.length ? formats : ["qr_code"] });
}

/**
 * Live camera barcode/QR scanning loop. On every detected code, `onDetect` is
 * awaited with the raw value. A code only fires again once it has been out of
 * view for 2s, so a label held in front of the camera fires once. Shared by the
 * scan inputs and the asset scanner so camera handling lives in exactly one
 * place.
 *
 * The camera stays open between reads until it's hidden, so a run of labels
 * scans without reopening it; `lastDetected` confirms each read. Only one
 * camera session is active app-wide: opening a new one closes others.
 *
 * Uses the native `BarcodeDetector` where available and `@zxing/browser`
 * everywhere else (Safari / iOS), so the same component works on an iPhone.
 * Opens on the phone's ultra wide (0.5×) lens when it has one, and remembers
 * that lens so later opens start on it; `lenses` / `selectLens` switch lenses,
 * and a lens picked by hand replaces the remembered one.
 */
/**
 * What happened to a read. `void` counts as accepted.
 * - `"dropped"`: not taken (the form was busy), so the same code may fire again.
 * - `"rejected"`: taken but it failed (the caller shows the error). A red flash
 *   instead of a "Read …" confirmation, and the code stays suppressed so a held label doesn't repeat
 *   the error every frame.
 */
export type ScanOutcome = "accepted" | "dropped" | "rejected";

export function useBarcodeCamera(
  onDetect: (raw: string) => void | ScanOutcome | Promise<void | ScanOutcome>,
) {
  const sessionId = useId();
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [lastDetected, setLastDetected] = useState<string | null>(null);
  const [lenses, setLenses] = useState<CameraLens[]>([]);
  const [requestedLensId, setRequestedLensId] = useState<string | null>(readStoredLens);
  const [activeLensId, setActiveLensId] = useState<string | null>(null);
  /** Bumped per read so the preview can flash; `kind` picks the colour. */
  const [feedback, setFeedback] = useState<{ kind: "accepted" | "rejected"; id: number } | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [muted, setMuted] = useState(readScanSoundMuted);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const mutedRef = useRef(muted);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastScanRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const inFlightRef = useRef(false);
  const onDetectRef = useRef(onDetect);

  useEffect(() => {
    onDetectRef.current = onDetect;
  });

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const supported = canUseCameraScanner();

  // A run of scans can outlast the screen timeout; keep the phone awake while the camera is up.
  useEffect(() => {
    if (!cameraOn || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let released = false;
    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      void navigator.wakeLock
        .request("screen")
        .then((next) => {
          if (released) void next.release();
          else lock = next;
        })
        .catch(() => undefined);
    };
    acquire();
    // The browser drops the lock when the tab hides; take it back on return.
    document.addEventListener("visibilitychange", acquire);
    return () => {
      released = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => undefined);
    };
  }, [cameraOn]);

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

  const closeCamera = useCallback(() => {
    releaseBarcodeCameraSession(sessionId);
    setCameraOn(false);
    setCameraError(null);
  }, [sessionId]);

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
    setLastDetected(null);
    setFeedback(null);
    setScanCount(0);
    unlockScanSound();
    claimBarcodeCameraSession(sessionId);
    setCameraOn(true);
  }

  function toggleMuted() {
    const next = !muted;
    writeScanSoundMuted(next);
    setMuted(next);
    if (!next) unlockScanSound();
  }

  function toggleTorch() {
    const track = trackRef.current;
    if (!track) return;
    const next = !torchOn;
    void track
      .applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] })
      .then(() => setTorchOn(next))
      .catch(() => setTorchSupported(false));
  }

  function selectLens(deviceId: string) {
    writeStoredLens(deviceId);
    setRequestedLensId(deviceId);
  }

  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;
    const Detector = getBarcodeDetector();
    let controls: IScannerControls | null = null;
    let stream: MediaStream | null = null;

    /** De-dupe and forward a raw scan to the caller. */
    async function handleRaw(value: string) {
      const raw = value.trim();
      // A detect that resolves after the camera closed must not reach the caller.
      // One read at a time: ZXing fires per frame without waiting for the last read.
      if (cancelled || !raw || inFlightRef.current) return;
      const now = Date.now();
      if (raw === lastScanRef.current.value && now - lastScanRef.current.at <= 2000) {
        // Still in view: slide the window so it can't re-fire while held up.
        lastScanRef.current.at = now;
        return;
      }
      lastScanRef.current = { value: raw, at: now };
      inFlightRef.current = true;
      let outcome: void | ScanOutcome;
      try {
        outcome = await onDetectRef.current(raw);
      } finally {
        // Restart the window from when the read finished, so a save slower
        // than 2s doesn't let the still-held code fire again.
        lastScanRef.current = { value: raw, at: Date.now() };
        inFlightRef.current = false;
      }
      if (outcome === "dropped") {
        lastScanRef.current = { value: "", at: 0 };
        return;
      }
      if (cancelled) return;
      const kind = outcome === "rejected" ? "rejected" : "accepted";
      setFeedback({ kind, id: Date.now() });
      if (!mutedRef.current) playScanSound(kind);
      navigator.vibrate?.(kind === "accepted" ? 40 : [60, 60, 60]);
      if (kind === "rejected") return;
      setLastDetected(raw);
      setScanCount((count) => count + 1);
    }

    async function startNative(media: MediaStream) {
      const video = videoRef.current;
      if (video) {
        video.srcObject = media;
        await video.play();
      }
      const detector = await createNativeDetector(Detector!);
      const tick = async () => {
        if (cancelled || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          await handleRaw(codes[0]?.rawValue ?? "");
        } catch {
          // keep scanning
        }
        if (!cancelled) {
          window.setTimeout(tick, 200);
        }
      };
      void tick();
    }

    /**
     * Safari has no `BarcodeDetector`, so scan frames with ZXing. It decodes
     * our stream into the preview; `controls.stop()` tears the loop down.
     */
    async function startFallback(media: MediaStream): Promise<IScannerControls | null> {
      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
        import("@zxing/browser"),
        import("@zxing/library"),
      ]);
      const hints = new Map<DecodeHint, unknown>([
        [
          DecodeHintType.POSSIBLE_FORMATS,
          [
            BarcodeFormat.QR_CODE,
            BarcodeFormat.DATA_MATRIX,
            BarcodeFormat.CODE_128,
            BarcodeFormat.CODE_39,
            BarcodeFormat.CODE_93,
            BarcodeFormat.CODABAR,
            BarcodeFormat.ITF,
            BarcodeFormat.EAN_13,
            BarcodeFormat.EAN_8,
            BarcodeFormat.UPC_A,
            BarcodeFormat.UPC_E,
          ],
        ],
        [DecodeHintType.TRY_HARDER, true],
      ]);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 150 });
      const video = videoRef.current;
      if (!video || cancelled) return null;
      const started = await reader.decodeFromStream(media, video, (result) => {
        if (result) void handleRaw(result.getText());
      });
      if (cancelled) {
        started.stop();
        return null;
      }
      return started;
    }

    async function start() {
      try {
        try {
          stream = await openCameraStream(requestedLensId);
        } catch (error) {
          // A remembered lens can disappear (another phone, revoked permission): fall back.
          if (!requestedLensId) throw error;
          writeStoredLens(null);
          stream = await openCameraStream(null);
        }
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const track = stream.getVideoTracks()[0] ?? null;
        trackRef.current = track;
        const activeId = track?.getSettings().deviceId ?? null;
        setActiveLensId(activeId);
        setTorchOn(false);
        setTorchSupported(
          Boolean((track?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch),
        );
        // Lens names only appear once the camera is allowed, so list them now.
        const available = await listCameraLenses().catch(() => [] as CameraLens[]);
        if (cancelled) return;
        setLenses(available);
        // The 1× lens can't focus on a label held close, so default to the
        // ultra wide (0.5×) when the phone has one. Remember it so the next open
        // starts there instead of switching again. A lens picked by hand wins.
        const closeUp = available.find((lens) => lens.label === CLOSE_UP_LENS_LABEL);
        if (!requestedLensId && closeUp && closeUp.deviceId !== activeId) {
          writeStoredLens(closeUp.deviceId);
          setRequestedLensId(closeUp.deviceId);
          return;
        }
        if (Detector) {
          await startNative(stream);
        } else {
          controls = await startFallback(stream);
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
      stream?.getTracks().forEach((track) => track.stop());
      trackRef.current = null;
    };
  }, [cameraOn, sessionId, requestedLensId]);

  return {
    cameraOn,
    toggleCamera,
    closeCamera,
    cameraError,
    videoRef,
    supported,
    lastDetected,
    lenses,
    activeLensId,
    selectLens,
    feedback,
    scanCount,
    muted,
    toggleMuted,
    torchSupported,
    torchOn,
    toggleTorch,
  };
}

export type BarcodeCamera = ReturnType<typeof useBarcodeCamera>;
