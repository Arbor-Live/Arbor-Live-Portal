"use client";

import { useCallback, useRef } from "react";
import Image from "next/image";
import { useResolvedAssetUrl } from "@/components/files/stored-asset-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  fileFromClipboardEvent,
  useR2FileUpload,
  type InventoryUploadEntityKind,
  type InventoryUploadPurpose,
  type R2UploadArgs,
} from "@/hooks/use-r2-file-upload";
import {
  defaultAcceptForPurpose,
  defaultTitleFromFileName,
  isImageAssetReference,
} from "@/lib/r2-assets";
import { ImmichImportButton } from "@/components/marketing/immich-library-picker";

type R2UploadFieldProps = {
  label: string;
  uploadArgs: R2UploadArgs;
  accept?: string;
  currentUrl?: string;
  onUploaded: (storedValue: string) => void;
  onClear?: () => void;
  urlValue?: string;
  onUrlChange?: (url: string) => void;
  urlPlaceholder?: string;
  helperText?: string;
  className?: string;
  pasteHint?: string;
};

function R2UploadField({
  label,
  uploadArgs,
  accept,
  currentUrl,
  onUploaded,
  onClear,
  urlValue,
  onUrlChange,
  urlPlaceholder = "https://… or r2:…",
  helperText,
  className,
  pasteHint = "Focus this area and paste (Ctrl+V), or choose a file.",
}: R2UploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const { uploadFile, busy, error } = useR2FileUpload(uploadArgs);

  const storedValue = (urlValue ?? currentUrl ?? "").trim();
  const resolvedPreviewUrl = useResolvedAssetUrl(storedValue);
  const showImagePreview = Boolean(
    storedValue && isImageAssetReference(storedValue) && resolvedPreviewUrl,
  );

  const purpose =
    uploadArgs.scope === "event"
      ? uploadArgs.purpose
      : uploadArgs.scope === "venue"
        ? "manual"
        : uploadArgs.scope === "marketing" || uploadArgs.scope === "organization"
          ? "hero"
          : uploadArgs.purpose;
  const resolvedAccept = accept ?? defaultAcceptForPurpose(purpose);

  const handleFile = useCallback(
    async (file: File) => {
      const storedReference = await uploadFile(file);
      if (!storedReference) return;
      onUploaded(storedReference);
      onUrlChange?.(storedReference);
    },
    [onUploaded, onUrlChange, uploadFile],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent) => {
      if (busy) return;
      const file = fileFromClipboardEvent(event.nativeEvent);
      if (!file) return;
      event.preventDefault();
      void handleFile(file);
    },
    [busy, handleFile],
  );

  const previewHref = resolvedPreviewUrl ?? (storedValue.startsWith("http") ? storedValue : undefined);

  return (
    <div className={cn("space-y-2", className)}>
      <Label>{label}</Label>
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}

      {showImagePreview && previewHref ? (
        <div className="relative h-28 w-full max-w-xs overflow-hidden rounded-md border bg-muted">
          <Image src={previewHref} alt="" fill className="object-cover" unoptimized />
        </div>
      ) : storedValue ? (
        <p className="text-xs text-muted-foreground break-all">
          Current file:{" "}
          {previewHref ? (
            <a
              href={previewHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              {storedValue.split("/").pop()}
            </a>
          ) : (
            storedValue
          )}
        </p>
      ) : null}

      <div
        ref={zoneRef}
        tabIndex={0}
        onPaste={handlePaste}
        className={cn(
          "rounded-md border border-dashed p-3 outline-none transition-colors",
          "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/30",
        )}
      >
        <p className="mb-2 text-xs text-muted-foreground">{pasteHint}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={resolvedAccept}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              if (inputRef.current) inputRef.current.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? "Uploading…" : storedValue ? "Replace file" : "Choose file"}
          </Button>
          {uploadArgs.scope === "marketing" ? (
            <ImmichImportButton
              postId={uploadArgs.postId}
              imageKind={uploadArgs.imageKind}
              disabled={busy}
              onImported={(storedReference) => {
                onUploaded(storedReference);
                onUrlChange?.(storedReference);
              }}
            />
          ) : null}
          {storedValue && onClear ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClear}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>

      {onUrlChange ? (
        <Input
          value={urlValue ?? currentUrl ?? ""}
          placeholder={urlPlaceholder}
          onChange={(event) => onUrlChange(event.target.value)}
        />
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

type FileUploadFieldProps = {
  label: string;
  entityKind: InventoryUploadEntityKind;
  purpose: InventoryUploadPurpose;
  entityId?: string;
  accept?: string;
  currentUrl?: string;
  onUploaded: (storedValue: string) => void;
  onClear?: () => void;
  urlValue?: string;
  onUrlChange?: (url: string) => void;
  urlPlaceholder?: string;
  helperText?: string;
  className?: string;
};

export function FileUploadField(props: FileUploadFieldProps) {
  const { entityKind, purpose, entityId, ...rest } = props;
  return (
    <R2UploadField
      uploadArgs={{ scope: "inventory", entityKind, purpose, entityId }}
      {...rest}
    />
  );
}

type MarketingPostHeroUploadFieldProps = {
  postId?: string;
  label?: string;
  currentUrl?: string;
  onUploaded: (storedValue: string) => void;
  onClear?: () => void;
  urlValue?: string;
  onUrlChange?: (url: string) => void;
  helperText?: string;
  className?: string;
};

export function MarketingPostHeroUploadField({
  postId,
  label = "Cover image",
  helperText = "Optional hero image for cards and the detail page. JPEG, PNG, WebP, GIF, or SVG up to 5 MB.",
  ...rest
}: MarketingPostHeroUploadFieldProps) {
  return (
    <R2UploadField
      label={label}
      uploadArgs={{ scope: "marketing", postId, imageKind: "hero" }}
      accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
      helperText={helperText}
      {...rest}
    />
  );
}

type EventArtifactUploadFieldProps = {
  eventId: string;
  label?: string;
  currentUrl?: string;
  onUploaded: (storedValue: string) => void;
  onClear?: () => void;
  urlValue?: string;
  onUrlChange?: (url: string) => void;
  helperText?: string;
  className?: string;
};

export function EventArtifactUploadField({
  eventId,
  label = "Attachment",
  helperText = "Upload an image or document for this artifact.",
  ...rest
}: EventArtifactUploadFieldProps) {
  return (
    <R2UploadField
      label={label}
      uploadArgs={{ scope: "event", eventId, purpose: "artifact" }}
      helperText={helperText}
      {...rest}
    />
  );
}

type EventPosterUploadFieldProps = {
  eventId: string;
  label?: string;
  currentUrl?: string;
  onUploaded: (storedValue: string) => void;
  onClear?: () => void;
  urlValue?: string;
  onUrlChange?: (url: string) => void;
  helperText?: string;
  className?: string;
};

export function EventPosterUploadField({
  eventId,
  label = "Poster image",
  helperText = "JPEG, PNG, WebP, GIF, or SVG up to 5 MB. Shown on the public event page.",
  ...rest
}: EventPosterUploadFieldProps) {
  return (
    <R2UploadField
      label={label}
      uploadArgs={{ scope: "event", eventId, purpose: "poster" }}
      accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
      helperText={helperText}
      {...rest}
    />
  );
}

type BandHeroUploadFieldProps = {
  organizationId: string;
  label?: string;
  currentUrl?: string;
  onUploaded: (storedValue: string) => void;
  onClear?: () => void;
  urlValue?: string;
  onUrlChange?: (url: string) => void;
  helperText?: string;
  className?: string;
};

export function BandHeroUploadField({
  organizationId,
  label = "Hero image",
  helperText = "Shown on your public artist page. JPEG, PNG, WebP, GIF, or SVG up to 5 MB.",
  ...rest
}: BandHeroUploadFieldProps) {
  return (
    <R2UploadField
      label={label}
      uploadArgs={{ scope: "organization", organizationId }}
      accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
      helperText={helperText}
      urlPlaceholder="https://… or upload a file"
      {...rest}
    />
  );
}

type InventoryResourceUploadButtonProps = {
  entityKind: InventoryUploadEntityKind;
  purpose: Extract<InventoryUploadPurpose, "manual" | "gdtf">;
  entityId?: string;
  disabled?: boolean;
  onUploaded: (result: { url: string; title: string }) => void;
};

export function InventoryResourceUploadButton({
  entityKind,
  purpose,
  entityId,
  disabled,
  onUploaded,
}: InventoryResourceUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, busy, error } = useR2FileUpload({
    scope: "inventory",
    entityKind,
    purpose,
    entityId,
  });

  async function handleFile(file: File) {
    const storedReference = await uploadFile(file);
    if (!storedReference) return;
    const defaultTitle =
      purpose === "gdtf"
        ? defaultTitleFromFileName(file.name, "GDTF")
        : defaultTitleFromFileName(file.name, "Manual");
    onUploaded({ url: storedReference, title: defaultTitle });
  }

  return (
    <div
      tabIndex={0}
      onPaste={(event) => {
        if (disabled || busy) return;
        const file = fileFromClipboardEvent(event.nativeEvent);
        if (!file) return;
        event.preventDefault();
        void handleFile(file);
      }}
      className={cn(
        "flex flex-col gap-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
      )}
      title="Paste file with Ctrl+V"
    >
      <input
        ref={inputRef}
        type="file"
        accept={defaultAcceptForPurpose(purpose)}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Uploading…" : "Upload"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

type VenueDocumentUploadButtonProps = {
  venueId?: string;
  disabled?: boolean;
  onUploaded: (result: {
    r2Key: string;
    title: string;
    fileName: string;
    contentType: string;
  }) => void;
};

export function VenueDocumentUploadButton({
  venueId,
  disabled,
  onUploaded,
}: VenueDocumentUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, busy, error } = useR2FileUpload({
    scope: "venue",
    venueId,
    purpose: "document",
  });

  async function handleFile(file: File) {
    const storedReference = await uploadFile(file);
    if (!storedReference) return;
    onUploaded({
      r2Key: storedReference,
      title: defaultTitleFromFileName(file.name, "Document"),
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.zip,.vwx,.dwg,.dxf,.md,.txt,.doc,.docx,.xls,.xlsx,application/pdf,application/zip,application/octet-stream"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Uploading…" : "Upload file"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export type { InventoryUploadEntityKind, InventoryUploadPurpose };
