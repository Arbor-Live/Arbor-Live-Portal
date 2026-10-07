/**
 * Audible scan confirmation. iOS Safari has no `navigator.vibrate`, so without
 * a tone the only sign of a read on an iPhone is text nobody is looking at
 * while aiming. One shared AudioContext, unlocked from the tap that opens the
 * camera (iOS refuses to start audio outside a user gesture).
 */

const MUTE_STORAGE_KEY = "arbor.barcodeCamera.muted";

let audioContext: AudioContext | null = null;

export function readScanSoundMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeScanSoundMuted(muted: boolean) {
  try {
    if (muted) window.localStorage.setItem(MUTE_STORAGE_KEY, "1");
    else window.localStorage.removeItem(MUTE_STORAGE_KEY);
  } catch {
    // private mode: the setting just isn't remembered
  }
}

/** Call from a click handler so later tones are allowed to play. */
export function unlockScanSound() {
  if (typeof window === "undefined") return;
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  audioContext ??= new Ctor();
  void audioContext.resume().catch(() => undefined);
}

function tone(frequency: number, startOffset: number, duration: number, type: OscillatorType) {
  if (!audioContext || audioContext.state !== "running") return;
  const start = audioContext.currentTime + startOffset;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

/** A short high beep for a read that was taken, a low double buzz for one that failed. */
export function playScanSound(kind: "accepted" | "rejected") {
  if (kind === "accepted") {
    tone(1760, 0, 0.09, "sine");
    return;
  }
  tone(220, 0, 0.12, "square");
  tone(220, 0.16, 0.12, "square");
}
