"use client";

import { EventPosterUploadField, MarketingPostHeroUploadField } from "@/components/files/file-upload-field";
import {
  MarketingLinksEditor,
  PartifulCohostAdminLink,
} from "@/components/marketing/marketing-links-editor";
import { Label } from "@/components/ui/label";
import { MarketingLinkIcon } from "@/lib/marketing-link-icons";
import { cn } from "@/lib/utils";

export type MarketingAdditionalLink = {
  label: string;
  url: string;
  icon?: string;
};

export function emptyMarketingLink(): MarketingAdditionalLink {
  return { label: "", url: "" };
}

export function filterMarketingLinks(links: MarketingAdditionalLink[]) {
  return links.filter((link) => link.label.trim() && link.url.trim());
}

export function marketingLinksEqual(a: MarketingAdditionalLink[], b: MarketingAdditionalLink[]) {
  const left = filterMarketingLinks(
    a.map((link) => ({
      label: link.label.trim(),
      url: link.url.trim(),
      icon: link.icon?.trim() || undefined,
    })),
  );
  const right = filterMarketingLinks(
    b.map((link) => ({
      label: link.label.trim(),
      url: link.url.trim(),
      icon: link.icon?.trim() || undefined,
    })),
  );
  if (left.length !== right.length) return false;
  return left.every(
    (link, index) =>
      link.label === right[index]?.label &&
      link.url === right[index]?.url &&
      (link.icon ?? "") === (right[index]?.icon ?? ""),
  );
}

export function isPartifulUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const host = new URL(withProtocol).hostname.toLowerCase();
    return host === "partiful.com" || host.endsWith(".partiful.com");
  } catch {
    return false;
  }
}

export function isPartifulCohostInviteUrl(url: string | undefined | null): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();
    return (
      parsed.protocol === "https:" &&
      (host === "partiful.com" || host.endsWith(".partiful.com"))
    );
  } catch {
    return false;
  }
}

export function linksIncludePartiful(links: Array<{ url: string }> | undefined) {
  return (links ?? []).some((link) => isPartifulUrl(link.url));
}

const textareaClassName =
  "flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

type PosterUploadProps =
  | { type: "event"; eventId: string }
  | { type: "marketing-post"; postId?: string };

export function EventMarketingContentFields({
  idPrefix,
  imageUrl,
  onImageUrlChange,
  imagePreviewUrl,
  caption,
  onCaptionChange,
  additionalLinks,
  onAdditionalLinksChange,
  partifulCohostUrl,
  onPartifulCohostUrlChange,
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
  partifulCohostUrl?: string;
  onPartifulCohostUrlChange?: (value: string) => void;
  posterUpload: PosterUploadProps;
  disabled?: boolean;
  readOnly?: boolean;
  captionLabel?: string;
  captionPlaceholder?: string;
  className?: string;
}) {
  const previewSrc = (imagePreviewUrl || imageUrl).trim();
  const links = additionalLinks.length > 0 ? additionalLinks : [emptyMarketingLink()];

  if (readOnly) {
    return (
      <div className={cn("space-y-4", className)}>
        {previewSrc ? (
          <div className="mx-auto w-full max-w-xs overflow-hidden rounded-xl border bg-muted/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewSrc} alt="" className="aspect-(--aspect-poster) w-full object-cover" />
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
                <li key={`${link.label}:${link.url}`} className="flex items-center gap-2">
                  <MarketingLinkIcon id={link.icon} className="size-4 shrink-0" />
                  <a href={link.url} target="_blank" rel="noreferrer" className="underline">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <PartifulCohostAdminLink url={partifulCohostUrl} />
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
      ) : (
        <MarketingPostHeroUploadField
          postId={posterUpload.postId}
          label="Poster image"
          currentUrl={imageUrl || imagePreviewUrl || undefined}
          onUploaded={onImageUrlChange}
          onClear={() => onImageUrlChange("")}
        />
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

      <MarketingLinksEditor
        idPrefix={idPrefix}
        links={additionalLinks}
        onLinksChange={onAdditionalLinksChange}
        partifulCohostUrl={partifulCohostUrl}
        onPartifulCohostUrlChange={onPartifulCohostUrlChange}
        showCohost={Boolean(onPartifulCohostUrlChange)}
        disabled={disabled}
        label="Additional links"
      />
      {!onPartifulCohostUrlChange ? <PartifulCohostAdminLink url={partifulCohostUrl} /> : null}
    </div>
  );
}
