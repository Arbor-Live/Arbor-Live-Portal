"use client";

import { useState } from "react";
import { ImageCropDialog } from "@/components/files/image-crop-dialog";
import { POSTER_ASPECT_RATIO } from "@/lib/image-processing";

/** Dev-only harness for the crop dialog; see /preview-crop. */
export function CropPreview() {
  const [open, setOpen] = useState(true);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-medium">Crop dialog preview</h1>
      <ImageCropDialog
        open={open}
        file={new File([], "dev-poster.png", { type: "image/png" })}
        aspect={POSTER_ASPECT_RATIO}
        title="Crop poster"
        onCancel={() => setOpen(false)}
        onConfirm={() => setOpen(false)}
      />
      <button type="button" className="text-sm underline" onClick={() => setOpen(true)}>
        Reopen
      </button>
    </div>
  );
}
