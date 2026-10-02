"use client";

import { useRef, useState } from "react";
import { FileIcon, UploadSimpleIcon, XIcon, type Icon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Picks one local file, by dropping it on the box or through the "Choose file"
 * button (keyboard-friendly). Nothing is uploaded: the parent gets the `File`
 * and decides what to do with it. The real `<input type="file">` stays in the
 * DOM behind the label, so tests can `setInputFiles` on it by label or test id.
 */
export function FileDropzone({
  id,
  label,
  description,
  accept,
  file,
  detail,
  onFileChange,
  disabled,
  icon: ZoneIcon = UploadSimpleIcon,
  testId,
  className,
}: {
  id: string;
  /** Names the file ("Items CSV"); also labels the input and the remove button. */
  label: string;
  /** What the file should be, in plain words. */
  description?: React.ReactNode;
  accept?: string;
  file: File | null;
  /** A muted line under the chosen file name ("42 rows"). */
  detail?: React.ReactNode;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  icon?: Icon;
  testId?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const descriptionId = description ? `${id}-description` : undefined;

  const choose = () => inputRef.current?.click();

  return (
    <div className={cn("space-y-2", className)} data-testid={testId}>
      <Label htmlFor={id}>{label}</Label>
      {description ? (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        disabled={disabled}
        aria-describedby={descriptionId}
        className="sr-only"
        tabIndex={-1}
        data-testid={testId ? `${testId}-input` : undefined}
        onChange={(event) => {
          onFileChange(event.target.files?.[0] ?? null);
          // Let the same file be picked again after it's removed.
          event.target.value = "";
        }}
      />

      {file ? (
        <div className="flex items-center gap-3 border px-3 py-2.5 text-sm">
          <FileIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{file.name}</p>
            {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
          </div>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={choose}>
            Replace
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={`Remove ${label.toLowerCase()}`}
            title="Remove"
            onClick={() => onFileChange(null)}
          >
            <XIcon />
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "flex flex-col items-center gap-2 border border-dashed px-3 py-6 text-center text-sm text-muted-foreground transition-colors",
            dragging && "border-primary bg-muted/30",
            disabled && "opacity-60",
          )}
          onDragOver={(event) => {
            event.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (disabled) return;
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) onFileChange(dropped);
          }}
        >
          <ZoneIcon className="size-6" aria-hidden />
          <p>Drop the file here, or</p>
          <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={choose}>
            Choose file
          </Button>
        </div>
      )}
    </div>
  );
}
