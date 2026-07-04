"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type MediaUploadDropzoneProps = {
  targetType: "band" | "event";
  targetId: string;
  disabled?: boolean;
  onUploaded?: () => void;
  className?: string;
};

export function MediaUploadDropzone({
  targetType,
  targetId,
  disabled,
  onUploaded,
  className,
}: MediaUploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!targetId.trim() || disabled) return;
      const list = Array.from(files);
      if (!list.length) return;

      setBusy(true);
      setError(null);
      try {
        for (let index = 0; index < list.length; index += 1) {
          const file = list[index];
          setProgress(`Uploading ${index + 1} of ${list.length}…`);
          const formData = new FormData();
          formData.append("file", file);
          formData.append("targetType", targetType);
          formData.append("targetId", targetId);

          const response = await fetch("/api/immich/upload", {
            method: "POST",
            body: formData,
          });
          if (!response.ok) {
            const message = await response.text().catch(() => "Upload failed.");
            throw new Error(message || "Upload failed.");
          }
        }
        setProgress(null);
        onUploaded?.();
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
      } finally {
        setBusy(false);
        setProgress(null);
      }
    },
    [disabled, onUploaded, targetId, targetType],
  );

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "rounded-lg border border-dashed p-6 text-center transition-colors",
          disabled ? "opacity-50" : "hover:border-primary/50",
        )}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (disabled || busy) return;
          void uploadFiles(event.dataTransfer.files);
        }}
      >
        <p className="text-sm text-muted-foreground">
          Drag photos or videos here, or choose files to upload.
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          disabled={disabled || busy || !targetId}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Uploading…" : "Choose files"}
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
      {progress ? <p className="text-xs text-muted-foreground">{progress}</p> : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
