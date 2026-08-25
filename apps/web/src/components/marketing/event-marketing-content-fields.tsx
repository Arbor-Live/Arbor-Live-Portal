"use client";

import { useRef } from "react";
import { EventPosterUploadField, MarketingPostHeroUploadField } from "@/components/files/file-upload-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { fileFromClipboardEvent } from "@/hooks/use-r2-file-upload";

export type MarketingAdditionalLink = { label: string; url: string };

export function emptyMarketingLink(): MarketingAdditionalLink {
  return { label: "", url: "" };
}

export function filterMarketingLinks(links: MarketingAdditionalLink[]) {
  return links.filter((link) => link.label.trim() && link.url.trim());
}

export function marketingLinksEqual(a: MarketingAdditionalLink[], b: MarketingAdditionalLink[]) {
  const left = filterMarketingLinks(
    a.map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
  );
  const right = filterMarketingLinks(
    b.map((link) => ({ label: link.label.trim(), url: link.url.trim() })),
  );
  if (left.length !== right.length) return false;
  return left.every(
    (link, index) => link.label === right[index]?.label && link.url === right[index]?.url,
  );
}

const MAX_ADDITIONAL_LINKS = 10;

const textareaClassName =
  "flex min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

type PosterUploadProps =
  | { type: "event"; eventId: string }
  | { type: "marketing-post"; postId?: string }
  | {
      type: "file";
      busy?: boolean;
      onFile: (file: File) => void | Promise<void>;
    };

export function EventMarketingContentFields({
  idPrefix,
  imageUrl,
  onImageUrlChange,
  imagePreviewUrl,
  caption,
  onCaptionChange,
  additionalLinks,
  onAdditionalLinksChange,
  posterUpload,
  disabled = false,
  readOnly = false,
  captionLabel = "Public description",
  captionPlaceholder = "About text for the public event page (also used as Instagram caption)",
  className,
}: {
  idPrefix: string;
  imageUrl: string;
  onImageUrlChange: (url: string) => void;
  /** Optional resolved preview when `imageUrl` is a stored r2: reference. */
  imagePreviewUrl?: string | null;
  caption: string;
  onCaptionChange: (value: string) => void;
  additionalLinks: MarketingAdditionalLink[];
  onAdditionalLinksChange: (links: MarketingAdditionalLink[]) => void;
  posterUpload: PosterUploadProps;
  disabled?: boolean;
  readOnly?: boolean;
  captionLabel?: string;
  captionPlaceholder?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewSrc = (imagePreviewUrl || imageUrl).trim();
  const links = additionalLinks.length > 0 ? additionalLinks : [emptyMarketingLink()];

  if (readOnly) {
    return (
      <div className={cn("space-y-4", className)}>
        {previewSrc ? (
          <div className="overflow-hidden rounded-md border bg-muted/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewSrc} alt="" className="mx-auto max-h-80 w-auto object-contain" />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No poster uploaded yet.</p>
        )}
        {caption.trim() ? (
          <div className="space-y-1">
            <Label>{captionLabel}</Label>
            <p className="whitespace-pre-wrap text-sm">{caption}</p>
          </div>
        ) : null}
        {filterMarketingLinks(links).length > 0 ? (
          <div className="space-y-1">
            <Label>Additional links</Label>
            <ul className="space-y-1 text-sm">
              {filterMarketingLinks(links).map((link) => (
                <li key={`${link.label}:${link.url}`}>
                  <a href={link.url} target="_blank" rel="noreferrer" className="underline">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {posterUpload.type === "event" ? (
        <EventPosterUploadField
          eventId={posterUpload.eventId}
          currentUrl={imageUrl || imagePreviewUrl || undefined}
          onUploaded={onImageUrlChange}
          onClear={() => onImageUrlChange("")}
        />
      ) : posterUpload.type === "marketing-post" ? (
        <MarketingPostHeroUploadField
          postId={posterUpload.postId}
          label="Poster image"
          currentUrl={imageUrl || imagePreviewUrl || undefined}
          onUploaded={onImageUrlChange}
          onClear={() => onImageUrlChange("")}
        />
      ) : (
        <div
          className={cn(
            "space-y-2 rounded-md border border-dashed p-3",
            (disabled || posterUpload.busy) && "opacity-60",
          )}
          onPaste={(event) => {
            if (disabled || posterUpload.busy) return;
            const file = fileFromClipboardEvent(event.nativeEvent);
            if (!file) return;
            event.preventDefault();
            void posterUpload.onFile(file);
          }}
        >
          <Label htmlFor={`${idPrefix}-poster-upload`}>Upload poster image</Label>
          <input
            ref={inputRef}
            id={`${idPrefix}-poster-upload`}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
            className="hidden"
            disabled={disabled || posterUpload.busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void posterUpload.onFile(file);
            }}
          />
          {previewSrc ? (
            <div className="overflow-hidden rounded-md border bg-muted/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewSrc} alt="" className="mx-auto max-h-80 w-auto object-contain" />
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || posterUpload.busy}
              onClick={() => inputRef.current?.click()}
            >
              {posterUpload.busy ? "Uploading…" : previewSrc ? "Replace poster" : "Choose image"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            JPEG, PNG, WebP, GIF, or SVG up to 5 MB. Paste an image here, or choose a file.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-caption`}>{captionLabel}</Label>
        <textarea
          id={`${idPrefix}-caption`}
          rows={4}
          value={caption}
          onChange={(event) => onCaptionChange(event.target.value)}
          placeholder={captionPlaceholder}
          className={textareaClassName}
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label>Additional links</Label>
        {links.map((link, index) => (
          <div key={`${idPrefix}-link-${index}`} className="grid gap-2 sm:grid-cols-2">
            <Input
              value={link.label}
              placeholder="Label (e.g. Partiful RSVP)"
              disabled={disabled}
              onChange={(event) => {
                const next = [...links];
                next[index] = { ...next[index], label: event.target.value };
                onAdditionalLinksChange(next);
              }}
            />
            <Input
              value={link.url}
              placeholder="https://..."
              disabled={disabled}
              onChange={(event) => {
                const next = [...links];
                next[index] = { ...next[index], url: event.target.value };
                onAdditionalLinksChange(next);
              }}
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || links.length >= MAX_ADDITIONAL_LINKS}
          onClick={() => onAdditionalLinksChange([...links, emptyMarketingLink()])}
        >
          Add link
        </Button>
      </div>
    </div>
  );
}
