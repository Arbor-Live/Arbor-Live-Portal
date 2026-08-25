"use client";

import { useCallback, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/convex-api";
import { formatStoredR2Asset } from "@/lib/r2-assets";

export type R2UploadScope = "inventory" | "event" | "marketing" | "organization" | "venue";

export type InventoryUploadEntityKind = "package" | "type" | "item";
export type InventoryUploadPurpose = "hero" | "icon" | "promo" | "manual" | "gdtf" | "damage";

export type R2UploadArgs =
  | {
      scope: "inventory";
      entityKind: InventoryUploadEntityKind;
      purpose: InventoryUploadPurpose;
      entityId?: string;
    }
  | {
      scope: "event";
      eventId: string;
      purpose: "artifact" | "poster";
    }
  | {
      scope: "marketing";
      postId?: string;
      imageKind: "hero" | "content";
    }
  | {
      scope: "organization";
      organizationId: string;
    }
  | {
      scope: "venue";
      venueId?: string;
      purpose: "document";
    };

function createUploadId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeClipboardFile(file: File): File {
  if (file.name.trim()) return file;
  const ext = file.type.split("/")[1]?.split("+")[0] || "bin";
  return new File([file], `pasted-file.${ext}`, { type: file.type || "application/octet-stream" });
}

export function fileFromClipboardEvent(event: ClipboardEvent): File | null {
  const items = event.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) return normalizeClipboardFile(file);
    }
  }
  return null;
}

export function useR2FileUpload(uploadArgs: R2UploadArgs) {
  const draftUploadIdRef = useRef(createUploadId());
  const generateUploadUrl = useMutation(api.inventoryR2.generateR2UploadUrl);
  const syncMetadata = useMutation(api.inventoryR2.syncMetadata);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      setBusy(true);
      setError(null);
      try {
        const normalizedFile = file.name.trim() ? file : normalizeClipboardFile(file);
        const common = {
          fileName: normalizedFile.name,
          contentType: normalizedFile.type || "application/octet-stream",
          contentLength: normalizedFile.size,
          uploadId: draftUploadIdRef.current,
        };

        const { url, key } =
          uploadArgs.scope === "event"
            ? await generateUploadUrl({
                scope: "event",
                purpose: uploadArgs.purpose,
                eventId: uploadArgs.eventId as never,
                ...common,
              })
            : uploadArgs.scope === "marketing"
              ? await generateUploadUrl({
                  scope: "marketing",
                  purpose: "hero",
                  postId: uploadArgs.postId,
                  marketingImageKind: uploadArgs.imageKind,
                  ...common,
                })
              : uploadArgs.scope === "organization"
                ? await generateUploadUrl({
                    scope: "organization",
                    purpose: "hero",
                    organizationId: uploadArgs.organizationId,
                    ...common,
                  })
                : uploadArgs.scope === "venue"
                  ? await generateUploadUrl({
                      scope: "venue",
                      purpose: "document",
                      venueId: uploadArgs.venueId as never,
                      ...common,
                    })
                  : await generateUploadUrl({
                      scope: "inventory",
                      entityKind: uploadArgs.entityKind,
                      purpose: uploadArgs.purpose,
                      entityId: uploadArgs.entityId,
                      ...common,
                    });

        const response = await fetch(url, {
          method: "PUT",
          headers: {
            "Content-Type": normalizedFile.type || "application/octet-stream",
          },
          body: normalizedFile,
        });

        if (!response.ok) {
          throw new Error("Upload failed. Check R2 bucket CORS and credentials.");
        }

        await syncMetadata({ key });
        draftUploadIdRef.current = createUploadId();
        return formatStoredR2Asset(key);
      } catch (uploadError) {
        setError(
          uploadError instanceof Error ? uploadError.message : "Unable to upload file.",
        );
        return null;
      } finally {
        setBusy(false);
      }
    },
    [generateUploadUrl, syncMetadata, uploadArgs],
  );

  return { uploadFile, busy, error, setError };
}
