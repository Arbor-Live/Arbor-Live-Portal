"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ImagePlus } from "lucide-react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicEventPoster } from "@/components/public/public-event-poster";
import {
  emptyMarketingLink,
  filterMarketingLinks,
  marketingLinksEqual,
  type MarketingAdditionalLink,
} from "@/components/marketing/event-marketing-content-fields";
import { formatStoredR2Asset } from "@/lib/r2-assets";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fileFromClipboardEvent, normalizeClipboardFile } from "@/hooks/use-r2-file-upload";

type Portal = "request" | "quote";

const MAX_ADDITIONAL_LINKS = 10;

const textareaClassName =
  "flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  if (!poster.eligible || !poster.eventId) return null;

  const detailsDirty =
    caption.trim() !== (poster.caption ?? "").trim() ||
    !marketingLinksEqual(additionalLinks, poster.additionalLinks ?? []);
  const links = additionalLinks.length > 0 ? additionalLinks : [emptyMarketingLink()];
  const hasPoster = Boolean(poster.posterImageUrl);
  const uploadDisabled = busy || savingDetails;

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

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
          className="hidden"
          disabled={uploadDisabled}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void uploadFile(file);
          }}
        />

        {/* Mirrors public event detail: 4:5 poster + details column */}
        <div className="grid gap-8 md:grid-cols-2 md:items-start">
          <div
            tabIndex={0}
            role="button"
            aria-label={hasPoster ? "Replace poster image" : "Upload poster image"}
            className={cn(
              "group relative overflow-hidden rounded-xl outline-none ring-1 ring-border",
              "focus-visible:ring-2 focus-visible:ring-ring",
              uploadDisabled ? "opacity-60" : "cursor-pointer",
            )}
            onClick={() => {
              if (uploadDisabled) return;
              fileInputRef.current?.click();
            }}
            onKeyDown={(event) => {
              if (uploadDisabled) return;
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onPaste={(event) => {
              if (uploadDisabled) return;
              const file = fileFromClipboardEvent(event.nativeEvent);
              if (!file) return;
              event.preventDefault();
              void uploadFile(file);
            }}
          >
            <PublicEventPoster
              imageUrl={poster.posterImageUrl}
              eventId={poster.eventId}
              className="w-full rounded-xl object-cover"
            />
            <div
              className={cn(
                "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 px-4 text-center transition-opacity",
                hasPoster
                  ? "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
                  : "opacity-100",
              )}
            >
              <ImagePlus className="size-6 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">
                {busy ? "Uploading…" : hasPoster ? "Replace poster" : "Upload poster"}
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {poster.eventTitle ?? "Your event"}
              </h2>
              {poster.startAt != null ? (
                <p className="mt-2 text-muted-foreground">
                  {formatDateTime(poster.startAt, "long")}
                </p>
              ) : null}
              {poster.venueName?.trim() ? (
                <div className="mt-4">
                  <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Venue
                  </p>
                  <p className="mt-1">{poster.venueName.trim()}</p>
                </div>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor={`public-${portal}-caption`}>About</Label>
              <textarea
                id={`public-${portal}-caption`}
                rows={4}
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Short about text for your public event page"
                className={textareaClassName}
                disabled={savingDetails}
              />
            </div>

            <div className="space-y-2">
              <Label>Links</Label>
              {links.map((link, index) => (
                <div key={`public-${portal}-link-${index}`} className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={link.label}
                    placeholder="Label (e.g. Partiful RSVP)"
                    disabled={savingDetails}
                    onChange={(event) => {
                      const next = [...links];
                      next[index] = { ...next[index], label: event.target.value };
                      setAdditionalLinks(next);
                    }}
                  />
                  <Input
                    value={link.url}
                    placeholder="https://..."
                    disabled={savingDetails}
                    onChange={(event) => {
                      const next = [...links];
                      next[index] = { ...next[index], url: event.target.value };
                      setAdditionalLinks(next);
                    }}
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={savingDetails || links.length >= MAX_ADDITIONAL_LINKS}
                onClick={() => setAdditionalLinks([...links, emptyMarketingLink()])}
              >
                Add link
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                disabled={savingDetails || !detailsDirty}
                onClick={() => void saveDetails()}
              >
                {savingDetails ? "Saving…" : "Save description & links"}
              </Button>
            </div>
          </div>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
