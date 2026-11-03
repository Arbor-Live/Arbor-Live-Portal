/**
 * Svix webhook signature check (Resend signs its webhooks with Svix), done with
 * WebCrypto so the HTTP action needs no dependency and no Node runtime.
 * https://docs.svix.com/receiving/verifying-payloads/how-manual
 */

/** Svix rejects deliveries more than 5 minutes off to stop replays. */
export const SVIX_TOLERANCE_SECONDS = 5 * 60;

const SECRET_PREFIX = "whsec_";

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

export type SvixVerifyInput = {
  /** `whsec_…` signing secret from the Resend dashboard. */
  secret: string;
  /** `svix-id` header. */
  id: string;
  /** `svix-timestamp` header, in seconds. */
  timestamp: string;
  /** `svix-signature` header: space-separated `v1,<base64>` entries. */
  signature: string;
  /** The raw request body, exactly as received. */
  body: string;
  nowMs?: number;
};

export async function verifySvixSignature(input: SvixVerifyInput): Promise<boolean> {
  const timestampSeconds = Number(input.timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  const nowSeconds = (input.nowMs ?? Date.now()) / 1000;
  if (Math.abs(nowSeconds - timestampSeconds) > SVIX_TOLERANCE_SECONDS) return false;

  const secret = input.secret.startsWith(SECRET_PREFIX)
    ? input.secret.slice(SECRET_PREFIX.length)
    : input.secret;
  const keyBytes = base64ToBytes(secret);
  if (!keyBytes) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signedContent = new TextEncoder().encode(`${input.id}.${input.timestamp}.${input.body}`);

  for (const entry of input.signature.split(" ")) {
    const [version, encoded] = entry.split(",");
    if (version !== "v1" || !encoded) continue;
    const candidate = base64ToBytes(encoded);
    if (!candidate) continue;
    // `verify` compares in constant time, unlike a string or byte-loop ===.
    if (await crypto.subtle.verify("HMAC", key, candidate, signedContent)) return true;
  }
  return false;
}
