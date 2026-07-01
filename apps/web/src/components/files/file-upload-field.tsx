"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Image from "next/image";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatStoredInventoryAsset, isImageAssetReference } from "@/lib/inventory-assets";

export type InventoryUploadEntityKind = "package" | "type";
export type InventoryUploadPurpose = "hero" | "icon" | "promo" | "manual" | "gdtf";

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

function defaultAcceptForPurpose(purpose: InventoryUploadPurpose): string {
  switch (purpose) {
    case "hero":
    case "icon":
    case "promo":
      return "image/jpeg,image/png,image/webp,image/gif,image/svg+xml";
    case "manual":
      return "application/pdf,.pdf,.zip,.md,.txt,text/plain,text/markdown";
    case "gdtf":
      return ".gdtf,.zip,application/zip,application/octet-stream";
  }
}

function createUploadId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function useResolvedAssetPreview(storedValue: string | undefined) {
  const trimmed = storedValue?.trim() ?? "";
  return useQuery(
    api.inventoryR2.resolveInventoryAssetUrl,
    trimmed ? { value: trimmed } : "skip",
  );
}

export function FileUploadField({
  label,
  entityKind,
  purpose,
  entityId,
  accept,
  currentUrl,
  onUploaded,
  onClear,
  urlValue,
  onUrlChange,
  urlPlaceholder = "https://… or r2:…",
  helperText,
  className,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const draftUploadIdRef = useRef(createUploadId());
  const generateUploadUrl = useMutation(api.inventoryR2.generateInventoryUploadUrl);
  const syncMetadata = useMutation(api.inventoryR2.syncMetadata);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storedValue = (urlValue ?? currentUrl ?? "").trim();
  const resolvedPreviewUrl = useResolvedAssetPreview(storedValue);
  const showImagePreview = Boolean(
    storedValue && isImageAssetReference(storedValue) && resolvedPreviewUrl,
  );

  async function onFileSelected(file: File) {
    setBusy(true);
    setError(null);
    try {
      const { url, key } = await generateUploadUrl({
        entityKind,
        purpose,
        entityId,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        contentLength: file.size,
        uploadId: draftUploadIdRef.current,
      });

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error("Upload failed. Check R2 bucket CORS and credentials.");
      }

      await syncMetadata({ key });
      const storedReference = formatStoredInventoryAsset(key);
      onUploaded(storedReference);
      if (onUrlChange) onUrlChange(storedReference);
      draftUploadIdRef.current = createUploadId();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Unable to upload file.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const previewHref = resolvedPreviewUrl ?? (storedValue.startsWith("http") ? storedValue : undefined);

  return (
    <div className={cn("space-y-2", className)}>
      <Label>{label}</Label>
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}

      {showImagePreview && previewHref ? (
        <div className="relative h-28 w-full max-w-xs overflow-hidden rounded-md border bg-muted">
          <Image
            src={previewHref}
            alt=""
            fill
            className="object-cover"
            unoptimized
          />
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

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={accept ?? defaultAcceptForPurpose(purpose)}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void onFileSelected(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Uploading…" : storedValue ? "Replace file" : "Upload file"}
        </Button>
        {storedValue && onClear ? (
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClear}>
            Remove
          </Button>
        ) : null}
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
  const draftUploadIdRef = useRef(createUploadId());
  const generateUploadUrl = useMutation(api.inventoryR2.generateInventoryUploadUrl);
  const syncMetadata = useMutation(api.inventoryR2.syncMetadata);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFileSelected(file: File) {
    setBusy(true);
    setError(null);
    try {
      const defaultTitle =
        purpose === "gdtf"
          ? file.name.replace(/\.[^.]+$/, "") || "GDTF"
          : file.name.replace(/\.[^.]+$/, "") || "Manual";

      const { url, key } = await generateUploadUrl({
        entityKind,
        purpose,
        entityId,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
        contentLength: file.size,
        uploadId: draftUploadIdRef.current,
      });

      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error("Upload failed. Check R2 bucket CORS and credentials.");
      }

      await syncMetadata({ key });
      onUploaded({ url: formatStoredInventoryAsset(key), title: defaultTitle });
      draftUploadIdRef.current = createUploadId();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error ? uploadError.message : "Unable to upload file.",
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={defaultAcceptForPurpose(purpose)}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void onFileSelected(file);
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
