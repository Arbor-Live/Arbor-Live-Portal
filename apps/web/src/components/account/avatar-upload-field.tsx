"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ImageCropDialog } from "@/components/files/image-crop-dialog";
import { AVATAR_ASPECT_RATIO, isRasterImageFile } from "@/lib/image-processing";
import { UserAvatarUploadPreview } from "@/components/account/user-avatar";

type AvatarUploadFieldProps = {
  name: string;
  email: string;
  userId?: string | null;
  imageUrl?: string | null;
  buttonLabel: string;
  busy: boolean;
  disabled?: boolean;
  /** When true, skip the upload and just preview the chosen file locally. */
  previewOnly?: boolean;
  onSelected: (file: File) => void | Promise<void>;
  onPreview?: (file: File) => void;
};

/**
 * Avatar picker: crops raster images to a square before handing them to
 * onSelected. The upload itself stays with the caller (Convex storage).
 */
export function AvatarUploadField({
  name,
  email,
  userId,
  imageUrl,
  buttonLabel,
  busy,
  disabled,
  previewOnly,
  onSelected,
  onPreview,
}: AvatarUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const isDisabled = busy || disabled;

  const accept = (file: File) => {
    onPreview?.(file);
    void onSelected(file);
  };

  const handleFile = (file: File) => {
    if (previewOnly || !isRasterImageFile(file)) {
      accept(file);
      return;
    }
    setCropFile(file);
  };

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <UserAvatarUploadPreview name={name} email={email} userId={userId} imageUrl={imageUrl} />
      <div className="space-y-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) handleFile(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={isDisabled}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? "Uploading…" : buttonLabel}
        </Button>
      </div>

      <ImageCropDialog
        open={Boolean(cropFile)}
        file={cropFile}
        aspect={AVATAR_ASPECT_RATIO}
        title="Crop profile photo"
        onCancel={() => setCropFile(null)}
        onConfirm={(cropped) => {
          setCropFile(null);
          accept(cropped);
        }}
      />
    </div>
  );
}
