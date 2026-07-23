"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useConvex, useMutation } from "convex/react";
import {
  CheckCircleIcon,
  CircleNotchIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { optimisticResolveMyEventMedia } from "@/lib/crew-portal-optimistic";
import { uploadFileToImmichShare } from "@/lib/immich-upload";
import { useBeforeUnload } from "@/hooks/use-before-unload";
import { cn } from "@/lib/utils";

type MediaUploadDropzoneProps = {
  targetType: "band" | "event";
  targetId: string;
  disabled?: boolean;
  onUploaded?: () => void;
  className?: string;
};

type UploadItemPhase = "pending" | "uploading" | "saving" | "done" | "failed";

type UploadItem = {
  id: string;
  fileName: string;
  fileSize: number;
  phase: UploadItemPhase;
  loadedBytes: number;
  error?: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function createUploadItemId(file: File, index: number) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${file.name}-${file.size}-${index}-${Date.now()}`;
}

function computeOverallProgress(items: UploadItem[]) {
  const totalBytes = items.reduce((sum, item) => sum + item.fileSize, 0);
  if (!totalBytes) return 0;

  const uploadedBytes = items.reduce((sum, item) => {
    if (item.phase === "done" || item.phase === "saving") {
      return sum + item.fileSize;
    }
    if (item.phase === "uploading") {
      return sum + Math.min(item.loadedBytes, item.fileSize);
    }
    return sum;
  }, 0);

  return Math.min(100, Math.round((uploadedBytes / totalBytes) * 100));
}

function phaseLabel(item: UploadItem) {
  switch (item.phase) {
    case "pending":
      return "Waiting…";
    case "uploading":
      return `Uploading… ${formatBytes(item.loadedBytes)} / ${formatBytes(item.fileSize)}`;
    case "saving":
      return "Saving…";
    case "done":
      return "Complete";
    case "failed":
      return item.error ?? "Failed";
  }
}

export function MediaUploadDropzone({
  targetType,
  targetId,
  disabled,
  onUploaded,
  className,
}: MediaUploadDropzoneProps) {
  const convex = useConvex();
  const recordUploadedAsset = useMutation(api.immich.recordUploadedAsset);
  const resolveMyEventMedia = useMutation(
    api.crewPortal.resolveMyEventMedia,
  ).withOptimisticUpdate(optimisticResolveMyEventMedia);
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);

  const uploading = busy || items.some((item) => item.phase === "uploading" || item.phase === "saving");
  const overallProgress = useMemo(() => computeOverallProgress(items), [items]);
  const completedCount = items.filter((item) => item.phase === "done").length;
  const failedCount = items.filter((item) => item.phase === "failed").length;

  useBeforeUnload(uploading, "Uploads are still in progress. Leaving now may interrupt them.");

  const updateItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!targetId.trim() || disabled || uploading) return;
      const list = Array.from(files);
      if (!list.length) return;

      const queue: UploadItem[] = list.map((file, index) => ({
        id: createUploadItemId(file, index),
        fileName: file.name,
        fileSize: file.size,
        phase: "pending",
        loadedBytes: 0,
      }));

      setItems(queue);
      setBusy(true);
      setSummary(null);
      setFatalError(null);

      let successCount = 0;

      try {
        const config = await convex.query(api.immich.getUploadConfig, {
          targetType,
          targetId: targetId.trim(),
        });

        for (let index = 0; index < list.length; index += 1) {
          const file = list[index];
          const item = queue[index];
          if (!item) continue;

          updateItem(item.id, { phase: "uploading", loadedBytes: 0, error: undefined });

          try {
            const uploaded = await uploadFileToImmichShare(file, config, (progress) => {
              updateItem(item.id, {
                phase: "uploading",
                loadedBytes: progress.loaded,
              });
            });

            updateItem(item.id, { phase: "saving", loadedBytes: file.size });

            await recordUploadedAsset({
              albumLinkId: config.albumLinkId as Id<"immichAlbumLinks">,
              immichAssetId: uploaded.immichAssetId,
              originalFileName: uploaded.originalFileName,
              type: uploaded.type,
            });

            if (targetType === "event") {
              await resolveMyEventMedia({
                eventId: targetId.trim() as Id<"events">,
                status: "uploaded",
              });
            }

            updateItem(item.id, { phase: "done", loadedBytes: file.size });
            successCount += 1;
          } catch (uploadError) {
            updateItem(item.id, {
              phase: "failed",
              error: getConvexErrorMessage(uploadError),
            });
          }
        }

        const failures = list.length - successCount;
        if (successCount > 0) {
          onUploaded?.();
        }
        if (failures === 0) {
          setSummary(`Uploaded ${successCount} file${successCount === 1 ? "" : "s"}.`);
        } else if (successCount === 0) {
          setSummary("No files were uploaded.");
        } else {
          setSummary(
            `Uploaded ${successCount} of ${list.length} files. ${failures} failed — you can retry the failed files.`,
          );
        }
      } catch (uploadError) {
        setFatalError(getConvexErrorMessage(uploadError));
        setItems((current) =>
          current.map((item) =>
            item.phase === "pending" || item.phase === "uploading" || item.phase === "saving"
              ? { ...item, phase: "failed", error: getConvexErrorMessage(uploadError) }
              : item,
          ),
        );
      } finally {
        setBusy(false);
      }
    },
    [convex, disabled, onUploaded, recordUploadedAsset, resolveMyEventMedia, targetId, targetType, updateItem, uploading],
  );

  const showProgressPanel = items.length > 0;

  return (
    <div className={cn("space-y-3", className)}>
      {uploading ? (
        <Alert>
          <WarningCircleIcon className="size-4" />
          <AlertTitle>Upload in progress</AlertTitle>
          <AlertDescription>
            Keep this tab open until all uploads finish. Closing or refreshing may interrupt uploads.
          </AlertDescription>
        </Alert>
      ) : null}

      <div
        className={cn(
          "relative rounded-lg border border-dashed p-6 text-center transition-colors",
          disabled || uploading ? "opacity-60" : "hover:border-primary/50",
          uploading ? "border-primary/40 bg-muted/30" : undefined,
        )}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (disabled || uploading) return;
          void uploadFiles(event.dataTransfer.files);
        }}
      >
        <UploadSimpleIcon className="mx-auto mb-2 size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Drag photos or videos here, or choose files to upload.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          disabled={disabled || uploading || !targetId}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? "Uploading…" : "Choose files"}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const files = event.target.files;
            if (files) void uploadFiles(files);
            event.target.value = "";
          }}
        />
      </div>

      {showProgressPanel ? (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="font-medium">
              {uploading
                ? `Uploading ${completedCount + (items.some((item) => item.phase === "uploading" || item.phase === "saving") ? 1 : 0)} of ${items.length}…`
                : `Finished ${completedCount} of ${items.length}`}
            </p>
            <p className="text-muted-foreground">{overallProgress}%</p>
          </div>

          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-200",
                failedCount > 0 && !uploading ? "bg-destructive/80" : "bg-primary",
              )}
              style={{ width: `${overallProgress}%` }}
            />
          </div>

          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start gap-2 rounded-md border bg-background px-3 py-2 text-sm"
              >
                <span className="mt-0.5 shrink-0">
                  {item.phase === "done" ? (
                    <CheckCircleIcon className="size-4 text-emerald-600" aria-hidden />
                  ) : item.phase === "failed" ? (
                    <WarningCircleIcon className="size-4 text-destructive" aria-hidden />
                  ) : (
                    <CircleNotchIcon className="size-4 animate-spin text-muted-foreground" aria-hidden />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.fileName}</span>
                  <span
                    className={cn(
                      "block text-xs",
                      item.phase === "failed" ? "text-destructive" : "text-muted-foreground",
                    )}
                  >
                    {phaseLabel(item)}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(item.fileSize)}</span>
              </li>
            ))}
          </ul>

          {!uploading && failedCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || !targetId}
            >
              Choose files to retry
            </Button>
          ) : null}
        </div>
      ) : null}

      {summary ? <p className="text-sm text-muted-foreground">{summary}</p> : null}
      {fatalError ? <p className="text-sm text-destructive">{fatalError}</p> : null}
    </div>
  );
}
