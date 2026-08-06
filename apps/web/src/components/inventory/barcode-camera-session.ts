/**
 * Ensures only one live barcode/QR camera preview is open at a time across
 * ScanInput / ContainsEditor / AssetScanner instances on the same page.
 */

type Listener = () => void;

let activeSessionId: string | null = null;
const listeners = new Set<Listener>();

function notify() {
  for (const listener of listeners) listener();
}

export function getActiveBarcodeCameraSession(): string | null {
  return activeSessionId;
}

export function claimBarcodeCameraSession(sessionId: string) {
  if (activeSessionId === sessionId) return;
  activeSessionId = sessionId;
  notify();
}

export function releaseBarcodeCameraSession(sessionId: string) {
  if (activeSessionId !== sessionId) return;
  activeSessionId = null;
  notify();
}

export function subscribeBarcodeCameraSession(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
