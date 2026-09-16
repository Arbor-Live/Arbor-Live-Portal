"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ImageIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { PublicEventPoster } from "@/components/public/public-event-poster";
import {
  emptyMarketingLink,
  filterMarketingLinks,
  marketingLinksEqual,
  type MarketingAdditionalLink,
} from "@/components/marketing/event-marketing-content-fields";
import { MarketingLinksEditor } from "@/components/marketing/marketing-links-editor";
import { formatStoredR2Asset } from "@/lib/r2-assets";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { fileFromClipboardEvent, normalizeClipboardFile } from "@/hooks/use-r2-file-upload";

type Portal = "request" | "quote";

const POSTER_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/svg+xml";
const POSTER_ACCEPT_TYPES = new Set(
  POSTER_ACCEPT.split(",").map((type) => type.trim()).filter(Boolean),
);
const POSTER_ACCEPT_EXT = /\.(jpe?g|png|webp|gif|svg)$/i;

const textareaClassName =
  "flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function createUploadId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isAcceptedPosterFile(file: File) {
  if (file.type) return POSTER_ACCEPT_TYPES.has(file.type);
  // Some OS drops omit MIME; fall back to extension only then.
  return POSTER_ACCEPT_EXT.test(file.name);
}

function imageFileFromDataTransfer(dataTransfer: DataTransfer): File | null {
  return Array.from(dataTransfer.files).find(isAcceptedPosterFile) ?? null;
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
  const dialog = useAppDialog();

  const draftUploadIdRef = useRef(createUploadId());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [savingDetails, setSavingDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [caption, setCaption] = useState("");
  const [additionalLinks, setAdditionalLinks] = useState<MarketingAdditionalLink[]>([
    emptyMarketingLink(),
  ]);
  const [partifulCohostUrl, setPartifulCohostUrl] = useState("");
  const [detailsSourceKey, setDetailsSourceKey] = useState<string | null>(null);

  const days = poster?.days ?? [];
  const dayIndex = Math.min(activeDayIndex, Math.max(0, days.length - 1));
  const activeDay = days[dayIndex];
  const activeEventId = activeDay?.eventId;

  const sourceKey = activeEventId ? `${token}:${activeEventId}` : null;
  if (sourceKey && detailsSourceKey !== sourceKey) {
    setDetailsSourceKey(sourceKey);
    setCaption(activeDay?.caption ?? "");
    setAdditionalLinks(
      activeDay?.additionalLinks?.length ? activeDay.additionalLinks : [emptyMarketingLink()],
    );
    setPartifulCohostUrl(activeDay?.partifulCohostUrl ?? "");
  }

  const uploadFile = useCallback(
    async (file: File) => {
      if (!activeEventId) return;
      setBusy(true);
      setError(null);
      try {
        const normalizedFile = file.name.trim() ? file : normalizeClipboardFile(file);
        const { url, key } = await generateUploadUrl({
          portal,
          token,
          eventId: activeEventId,
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
          eventId: activeEventId,
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
    [activeEventId, generateUploadUrl, portal, savePoster, token],
  );

  const saveDetails = useCallback(async () => {
    if (!activeEventId) return;
    setSavingDetails(true);
    setError(null);
    try {
      await savePoster({
        portal,
        token,
        eventId: activeEventId,
        caption,
        additionalLinks: filterMarketingLinks(additionalLinks),
        partifulCohostUrl,
      });
      notify.success("Event page details saved.");
    } catch (saveError) {
      const message = getConvexErrorMessage(saveError);
      setError(message);
      notify.error(message);
    } finally {
      setSavingDetails(false);
    }
  }, [activeEventId, additionalLinks, caption, partifulCohostUrl, portal, savePoster, token]);

  if (poster === undefined) return null;
  if (!poster.eligible || !activeDay) return null;

  const detailsDirty =
    caption.trim() !== (activeDay.caption ?? "").trim() ||
    !marketingLinksEqual(additionalLinks, activeDay.additionalLinks ?? []) ||
    partifulCohostUrl.trim() !== (activeDay.partifulCohostUrl ?? "").trim();
  const hasPoster = Boolean(activeDay.posterImageUrl);
  const uploadDisabled = busy || savingDetails;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Poster & description</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {days.length > 1 ? (
          <div role="tablist" aria-label="Event day" className="flex flex-wrap gap-2">
            {days.map((day, index) => (
              <Button
                key={day.eventId}
                type="button"
                role="tab"
                size="sm"
                variant={index === dayIndex ? "default" : "outline"}
                aria-selected={index === dayIndex}
                disabled={uploadDisabled}
                onClick={() => {
                  if (index === dayIndex) return;
                  if (!detailsDirty) {
                    setActiveDayIndex(index);
                    return;
                  }
                  void dialog
                    .confirm({
                      title: "Discard unsaved changes?",
                      description:
                        "Your description and links for this day haven't been saved yet.",
                      confirmLabel: "Discard",
                      destructive: true,
                    })
                    .then((discard) => {
                      if (discard) setActiveDayIndex(index);
                    });
                }}
              >
                Day {index + 1}
              </Button>
            ))}
          </div>
        ) : null}
        {activeDay.onWebsite && !activeDay.instagramPublished ? (
          <p className="text-xs text-muted-foreground">
            This content is on the public event page. Arbor Live still reviews it before Instagram.
          </p>
        ) : null}
        {activeDay.instagramPublished ? (
          <p className="text-xs text-muted-foreground">
            This content is live on the public event page and Instagram.
          </p>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept={POSTER_ACCEPT}
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
              "group relative overflow-hidden rounded-xl outline-none ring-1 ring-border transition-[box-shadow,ring-color]",
              "focus-visible:ring-2 focus-visible:ring-ring",
              uploadDisabled ? "opacity-60" : "cursor-pointer",
              dragActive && "ring-2 ring-primary",
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
            onDragEnter={(event) => {
              event.preventDefault();
              if (uploadDisabled) return;
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = uploadDisabled ? "none" : "copy";
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              if (uploadDisabled) return;
              const file = imageFileFromDataTransfer(event.dataTransfer);
              if (!file) {
                notify.error("Drop an image file (JPEG, PNG, WebP, GIF, or SVG).");
                return;
              }
              void uploadFile(file);
            }}
          >
            <PublicEventPoster
              imageUrl={activeDay.posterImageUrl}
              eventId={activeDay.eventId}
              className="w-full rounded-xl object-cover"
            />
            <div
              className={cn(
                "pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 px-4 text-center transition-opacity",
                dragActive || busy || !hasPoster
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100",
              )}
            >
              <ImageIcon className="size-6 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">
                {busy
                  ? "Uploading…"
                  : dragActive
                    ? "Drop to upload"
                    : hasPoster
                      ? "Replace poster"
                      : "Upload poster"}
              </p>
              <p className="flex max-w-[16rem] flex-wrap items-center justify-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
                <span>Drag an image here, click to choose, or paste with</span>
                <KbdGroup>
                  <Kbd>Ctrl</Kbd>
                  <Kbd>V</Kbd>
                </KbdGroup>
                <span>/</span>
                <KbdGroup>
                  <Kbd>⌘</Kbd>
                  <Kbd>V</Kbd>
                </KbdGroup>
              </p>
            </div>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                {activeDay.eventTitle ?? "Your event"}
              </h2>
              {activeDay.startAt != null ? (
                <p className="mt-2 text-muted-foreground">
                  {formatDateTime(activeDay.startAt, "long")}
                </p>
              ) : null}
              {activeDay.venueName?.trim() ? (
                <div className="mt-4">
                  <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    Venue
                  </p>
                  <p className="mt-1">{activeDay.venueName.trim()}</p>
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

            <MarketingLinksEditor
              idPrefix={`public-${portal}`}
              links={additionalLinks}
              onLinksChange={setAdditionalLinks}
              partifulCohostUrl={partifulCohostUrl}
              onPartifulCohostUrlChange={setPartifulCohostUrl}
              disabled={savingDetails}
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
            </div>
          </div>
        </div>

        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
