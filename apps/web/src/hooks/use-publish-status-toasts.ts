"use client";

import { useEffect, useRef } from "react";
import { notify } from "@/lib/notify";

type PublishStatus =
  | { lastError?: string | null; instagramPostId?: string | null }
  | null
  | undefined;

/**
 * Toasts when a background Instagram publish finishes. `selectionKey` resets
 * the baseline so switching designs never replays a previous design's result.
 */
export function usePublishStatusToasts(design: PublishStatus, selectionKey?: string | null) {
  const previousRef = useRef<{
    key: string | null;
    error: string | null;
    postId: string | null;
  } | null>(null);

  useEffect(() => {
    const error = design?.lastError ?? null;
    const postId = design?.instagramPostId ?? null;
    const key = selectionKey ?? null;
    const previous = previousRef.current;
    previousRef.current = { key, error, postId };
    if (!previous || previous.key !== key) return;

    if (error && error !== previous.error) {
      notify.error(`Instagram publish failed: ${error}`);
    } else if (postId && postId !== previous.postId) {
      notify.success("Posted to Instagram.");
    }
  }, [design, selectionKey]);
}
