"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { authClient as appAuthClient } from "@/lib/auth-client";

type AuthClient = typeof appAuthClient;

/** Marks a binding made from the server-rendered token before the session loads. */
export const INITIAL_TOKEN_SESSION = "initial-token";

export type AuthBinding = {
  /** Session the Convex auth is bound to (or the initial-token placeholder). */
  sessionId: string | null;
  /** Identity of `fetchAccessToken`; a change re-authenticates the Convex client. */
  key: string | null;
};

export function initialAuthBinding(hasInitialToken: boolean): AuthBinding {
  return hasInitialToken
    ? { sessionId: INITIAL_TOKEN_SESSION, key: INITIAL_TOKEN_SESSION }
    : { sessionId: null, key: null };
}

/**
 * Re-key Convex auth only when the session actually changes hands.
 *
 * `ConvexProviderWithAuth` re-authenticates whenever `fetchAccessToken` changes,
 * and does it as clear-then-set: an `Authenticate: None` frame, then the token.
 * If the backend reruns subscriptions between the two, every query that needs
 * a user throws "You must be signed in" into the page's error boundary, which
 * doesn't recover when the token lands a moment later. The stock Better Auth
 * provider keys `fetchAccessToken` on the session id, so that window opened on
 * every page load: the server token authenticates first, then the session
 * finishes loading (undefined → id) and the key changes for the same session.
 * Adopting that first session id under the initial key closes it, while a real
 * change (another session, or signing back in) still re-keys.
 */
export function nextAuthBinding(
  binding: AuthBinding,
  sessionId: string | null | undefined,
): AuthBinding {
  if (!sessionId || sessionId === binding.sessionId) return binding;
  if (binding.sessionId === INITIAL_TOKEN_SESSION) {
    return { sessionId, key: binding.key };
  }
  return { sessionId, key: sessionId };
}

type TokenResponse = {
  data?: { token?: string | null } | null;
  error?: { status?: number } | null;
};

const TOKEN_RETRY_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 15_000, 30_000];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Convex reads a null token as a sign-out and reruns every subscription
 * without auth, so each guarded query throws into the error boundary. A tab
 * waking from sleep refetches its token before the network is back, so only a
 * definite "no session" answer returns null; failed requests are retried.
 */
export async function fetchConvexToken(
  request: () => Promise<TokenResponse>,
  sleep: (ms: number) => Promise<void> = wait,
): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    const result = await request().catch(() => null);
    if (result?.data?.token) return result.data.token;
    const status = result?.error?.status;
    const signedOut = result !== null && (!result.error || status === 401 || status === 403);
    const delay = TOKEN_RETRY_DELAYS_MS[attempt];
    if (signedOut || delay === undefined) return null;
    await sleep(delay);
  }
}

// The server token is only good for the first mount; a remount fetches a fresh one.
let initialTokenUsed = false;

/**
 * Better Auth → Convex `useAuth` adapter. Mirrors `ConvexBetterAuthProvider`
 * from `@convex-dev/better-auth/react`, except `fetchAccessToken` is keyed by
 * {@link nextAuthBinding} instead of the raw session id.
 */
export function useUseAuthFromBetterAuth(
  authClient: AuthClient,
  initialToken: string | null | undefined,
) {
  const [startToken] = useState(() => (initialTokenUsed ? null : (initialToken ?? null)));
  useEffect(() => {
    initialTokenUsed = true;
  }, []);

  return useMemo(
    () =>
      function useAuthFromBetterAuth() {
        const { data: session, isPending: isSessionPending } = authClient.useSession();
        const sessionId = session?.session?.id;
        const [cachedToken, setCachedToken] = useState<string | null>(startToken);
        const cachedTokenRef = useRef(cachedToken);
        const pendingTokenRef = useRef<Promise<string | null> | null>(null);

        const [binding, setBinding] = useState(() => initialAuthBinding(startToken !== null));
        const next = nextAuthBinding(binding, sessionId);
        if (next !== binding) setBinding(next);

        const storeToken = useCallback((token: string | null) => {
          cachedTokenRef.current = token;
          setCachedToken(token);
        }, []);

        useEffect(() => {
          if (!session && !isSessionPending && cachedTokenRef.current) {
            storeToken(null);
          }
        }, [session, isSessionPending, storeToken]);

        const fetchAccessToken = useCallback(
          async ({ forceRefreshToken = false }: { forceRefreshToken?: boolean } = {}) => {
            if (cachedTokenRef.current && !forceRefreshToken) {
              return cachedTokenRef.current;
            }
            if (!forceRefreshToken && pendingTokenRef.current) {
              return pendingTokenRef.current;
            }
            pendingTokenRef.current = fetchConvexToken(() =>
              authClient.convex.token({ fetchOptions: { throw: false } }),
            )
              .then((token) => {
                storeToken(token);
                return token;
              })
              .finally(() => {
                pendingTokenRef.current = null;
              });
            return pendingTokenRef.current;
          },
          // A new callback is what makes Convex re-authenticate; see nextAuthBinding.
          // eslint-disable-next-line react-hooks/exhaustive-deps
          [binding.key, storeToken],
        );

        return useMemo(
          () => ({
            isLoading: isSessionPending && !cachedToken,
            isAuthenticated: Boolean(session?.session) || cachedToken !== null,
            fetchAccessToken,
          }),
          [isSessionPending, session?.session, cachedToken, fetchAccessToken],
        );
      },
    [authClient, startToken],
  );
}
