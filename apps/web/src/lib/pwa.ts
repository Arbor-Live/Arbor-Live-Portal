/** Browser checks for Home Screen installs and Web Push. Client-only. */

/** Opened from the Home Screen (installed app) rather than a browser tab. */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPad, including iPadOS reporting itself as a Mac. */
export function isIos() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return isIos() || /Android|Mobi/i.test(navigator.userAgent);
}

export function supportsWebPush() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function urlBase64ToUint8Array(base64: string) {
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = window.atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export function registerServiceWorker() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

/** URL-safe base64 without padding: the form VAPID public keys are shared in. */
export function bufferToBase64Url(buffer: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Compare base64 keys regardless of padding or URL-safe alphabet. */
export function normalizeBase64Url(value: string) {
  return value.trim().replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The VAPID key a browser subscription was created with, or null if unknown. */
export function subscriptionServerKey(subscription: PushSubscription) {
  const key = subscription.options.applicationServerKey;
  return key ? bufferToBase64Url(key) : null;
}

/**
 * Drop this browser's push subscription, e.g. on sign-out, so the next person
 * on the device doesn't get the previous account's notifications. Pass
 * `removeFromServer` while the session is still valid; otherwise the dead
 * endpoint is pruned the next time a push to it is rejected.
 */
export async function releasePushSubscription(
  removeFromServer?: (endpoint: string) => Promise<unknown>,
) {
  if (!supportsWebPush()) return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    if (removeFromServer) await removeFromServer(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe();
  } catch {
    // Best effort: never block signing out.
  }
}
