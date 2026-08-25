"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  EventMarketingContentFields,
  emptyMarketingLink,
  filterMarketingLinks,
  marketingLinksEqual,
  type MarketingAdditionalLink,
} from "@/components/marketing/event-marketing-content-fields";
import { formatStoredR2Asset } from "@/lib/r2-assets";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { normalizeClipboardFile } from "@/hooks/use-r2-file-upload";

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

  const draftUploadIdRef = useRef(createUploadId());
  const [busy, setBusy] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [additionalLinks, setAdditionalLinks] = useState<MarketingAdditionalLink[]>([
    emptyMarketingLink(),
  ]);
  const [detailsSourceKey, setDetailsSourceKey] = useState<string | null>(null);

  const sourceKey = poster?.eligible ? `${token}:${poster.eventId ?? ""}` : null;
  if (sourceKey && detailsSourceKey !== sourceKey) {
    setDetailsSourceKey(sourceKey);
    setCaption(poster?.caption ?? "");
    setAdditionalLinks(
      poster?.additionalLinks?.length ? poster.additionalLinks : [emptyMarketingLink()],
    );
  }

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

  const saveDetails = useCallback(async () => {
    setSavingDetails(true);
    setError(null);
    try {
      await savePoster({
        portal,
        token,
        caption,
        additionalLinks: filterMarketingLinks(additionalLinks),
      });
      notify.success("Event page details saved.");
    } catch (saveError) {
      const message = getConvexErrorMessage(saveError);
      setError(message);
      notify.error(message);
    } finally {
      setSavingDetails(false);
    }
  }, [additionalLinks, caption, portal, savePoster, token]);

  if (poster === undefined) return null;
  if (!poster.eligible) return null;

  const detailsDirty =
    caption.trim() !== (poster.caption ?? "").trim() ||
    !marketingLinksEqual(additionalLinks, poster.additionalLinks ?? []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Poster & description</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {poster.onWebsite && !poster.instagramPublished ? (
          <p className="text-xs text-muted-foreground">
            This content is on the public event page. Arbor Live still reviews it before Instagram.
          </p>
        ) : null}
        {poster.instagramPublished ? (
          <p className="text-xs text-muted-foreground">
            This content is live on the public event page and Instagram.
          </p>
        ) : null}

        <EventMarketingContentFields
          idPrefix={`public-${portal}`}
          imageUrl=""
          onImageUrlChange={() => undefined}
          imagePreviewUrl={poster.posterImageUrl}
          caption={caption}
          onCaptionChange={setCaption}
          additionalLinks={additionalLinks}
          onAdditionalLinksChange={setAdditionalLinks}
          disabled={savingDetails}
          captionPlaceholder="Short about text for your public event page"
          posterUpload={{
            type: "file",
            busy,
            onFile: uploadFile,
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            disabled={savingDetails || !detailsDirty}
            onClick={() => void saveDetails()}
          >
            {savingDetails ? "Saving…" : "Save description & links"}
          </Button>
          <p className="text-xs text-muted-foreground">Shown on the public event page.</p>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
