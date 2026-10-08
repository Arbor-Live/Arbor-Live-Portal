"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { MediaGalleryAsset } from "@/components/media/media-gallery";

type MediaViewerProps = {
  asset: MediaGalleryAsset;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
};

export function MediaViewer({ asset, onClose, onPrevious, onNext }: MediaViewerProps) {
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto bg-black/90 text-white ring-white/10 sm:max-w-5xl"
        showCloseButton={false}
        aria-label={asset.originalFileName}
        aria-describedby={undefined}
      >
        <div className="flex items-center justify-between gap-2">
          <DialogTitle className="min-w-0 flex-1 truncate text-sm font-medium text-white">
            {asset.originalFileName}
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-2">
            {onPrevious ? (
              <Button type="button" size="sm" variant="secondary" onClick={onPrevious}>
                Previous
              </Button>
            ) : null}
            {onNext ? (
              <Button type="button" size="sm" variant="secondary" onClick={onNext}>
                Next
              </Button>
            ) : null}
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="relative flex min-h-[40vh] items-center justify-center overflow-hidden rounded-lg bg-black">
          {asset.type === "VIDEO" && asset.playbackUrl ? (
            <video
              src={asset.playbackUrl}
              controls
              autoPlay
              className="max-h-[80vh] max-w-full"
            />
          ) : (
            <Image
              src={asset.originalUrl}
              alt={asset.originalFileName}
              width={1600}
              height={1200}
              unoptimized
              className="max-h-[80vh] w-auto object-contain"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
