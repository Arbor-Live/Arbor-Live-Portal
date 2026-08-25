"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatStoredR2Asset } from "@/lib/r2-assets";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { fileFromClipboardEvent, normalizeClipboardFile } from "@/hooks/use-r2-file-upload";

type Portal = "request" | "quote";

function createUploadId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function PublicEventPosterSection({
  portal,
  token,
}: {
  portal: Portal;
  token: string;
}) {
  const poster = useQuery(
    portal === "request"
      ? api.publicEventPoster.getByRequestToken
      : api.publicEventPoster.getByQuoteToken,
    { token },
  );
  const generateUploadUrl = useMutation(api.publicEventPoster.generateUploadUrl);
  const savePoster = useMutation(api.publicEventPoster.save);

  const inputRef = useRef<HTMLInputElement>(null);
  const draftUploadIdRef = useRef(createUploadId());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setBusy(true);
      setError(null);
      try {
        const normalizedFile = file.name.trim() ? file : normalizeClipboardFile(file);
        const { url, key } = await generateUploadUrl({
          portal,
          token,
          fileName: normalizedFile.name,
          contentType: normalizedFile.type || "application/octet-stream",
          contentLength: normalizedFile.size,
          uploadId: draftUploadIdRef.current,
        });

        const response = await fetch(url, {
          method: "PUT",
          headers: {
            "Content-Type": normalizedFile.type || "application/octet-stream",
          },
          body: normalizedFile,
        });
        if (!response.ok) {
          throw new Error("Upload failed. Please try again.");
        }

        await savePoster({
          portal,
          token,
          imageUrl: formatStoredR2Asset(key),
        });
        draftUploadIdRef.current = createUploadId();
        notify.success("Poster uploaded. It will appear on the public event page.");
      } catch (uploadError) {
        const message = getConvexErrorMessage(uploadError);
        setError(message);
        notify.error(message);
      } finally {
        setBusy(false);
      }
    },
    [generateUploadUrl, portal, savePoster, token],
  );

  if (poster === undefined) return null;
  if (!poster.eligible) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event poster</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {poster.posterImageUrl ? (
          <div className="overflow-hidden rounded-md border bg-muted/20">
            {/* eslint-disable-next-line @next/next/no-img-element -- resolved R2/CDN URL */}
            <img
              src={poster.posterImageUrl}
              alt=""
              className="mx-auto max-h-80 w-auto object-contain"
            />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No poster yet. Upload one for {poster.eventTitle ?? "your event"}.
          </p>
        )}

        {poster.onWebsite && !poster.instagramPublished ? (
          <p className="text-xs text-muted-foreground">
            This poster is on the public event page. Arbor Live still reviews it before Instagram.
          </p>
        ) : null}
        {poster.instagramPublished ? (
          <p className="text-xs text-muted-foreground">
            This poster is live on the public event page and Instagram.
          </p>
        ) : null}

        <div
          className={cn(
            "space-y-2 rounded-md border border-dashed p-3",
            busy && "opacity-60",
          )}
          onPaste={(event) => {
            const file = fileFromClipboardEvent(event.nativeEvent);
            if (!file) return;
            event.preventDefault();
            void uploadFile(file);
          }}
        >
          <Label htmlFor={`poster-upload-${portal}`}>Upload poster image</Label>
          <input
            ref={inputRef}
            id={`poster-upload-${portal}`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            className="hidden"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void uploadFile(file);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              {busy ? "Uploading…" : poster.posterImageUrl ? "Replace poster" : "Choose image"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG, WebP, GIF, or SVG up to 5 MB. Paste an image here, or choose a file.
          </p>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
