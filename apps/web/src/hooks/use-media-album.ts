"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";

export type MediaAlbumTarget =
  | { targetType: "band"; targetId: string }
  | {
      targetType: "event";
      targetId: string;
      publicAccess?: { portal: "request" | "quote"; token: string };
    };

type AlbumState = {
  key: string;
  ready: boolean;
  error: string | null;
  albumShareUrl?: string;
};

/**
 * Ensures the Immich album for a band/event exists before uploads.
 *
 * Albums are created lazily, so every surface that lets someone upload must
 * ensure one first. Authenticated targets go through `immichEnsure.ensureUploadAlbum`;
 * token (public) targets go through the token-scoped action so uploads still
 * register with the portal. Pass `null` to skip (there is no work to do yet).
 */
export function useMediaAlbum(target: MediaAlbumTarget | null): {
  /** True once the album exists and uploads can start. */
  ready: boolean;
  /** Populated when ensure fails; callers decide whether to surface it. */
  error: string | null;
  /** Share URL, only returned by the public token flow. */
  albumShareUrl?: string;
} {
  const ensureUploadAlbum = useAction(api.immichEnsure.ensureUploadAlbum);
  const ensureByToken = useAction(api.eventFeedbackActions.ensureAlbumShareUrlByToken);

  const targetType = target?.targetType ?? null;
  const targetId = target?.targetId ?? null;
  const portal =
    target && target.targetType === "event" ? (target.publicAccess?.portal ?? null) : null;
  const token =
    target && target.targetType === "event" ? (target.publicAccess?.token ?? null) : null;

  const currentKey =
    targetType && targetId ? `${targetType}:${targetId}:${portal ?? ""}:${token ?? ""}` : null;

  const [state, setState] = useState<AlbumState | null>(null);

  useEffect(() => {
    if (!currentKey || !targetType || !targetId) return;

    const key = currentKey;
    const type = targetType;
    const id = targetId;
    let cancelled = false;

    async function ensure() {
      try {
        if (portal && token) {
          const result = await ensureByToken({
            portal,
            token,
            eventId: id as Id<"events">,
          });
          if (cancelled) return;
          setState({
            key,
            ready: Boolean(result?.albumShareUrl),
            error: null,
            albumShareUrl: result?.albumShareUrl,
          });
        } else {
          await ensureUploadAlbum({ targetType: type, targetId: id });
          if (cancelled) return;
          setState({ key, ready: true, error: null });
        }
      } catch (ensureError) {
        if (cancelled) return;
        setState({ key, ready: false, error: getConvexErrorMessage(ensureError) });
      }
    }

    void ensure();
    return () => {
      cancelled = true;
    };
  }, [currentKey, ensureByToken, ensureUploadAlbum, portal, targetId, targetType, token]);

  if (!currentKey || !state || state.key !== currentKey) {
    return { ready: false, error: null, albumShareUrl: undefined };
  }
  return { ready: state.ready, error: state.error, albumShareUrl: state.albumShareUrl };
}
