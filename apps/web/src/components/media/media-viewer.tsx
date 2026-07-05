"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import type { MediaGalleryAsset } from "@/components/media/media-gallery";

type MediaViewerProps = {
  asset: MediaGalleryAsset;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
};

export function MediaViewer({ asset, onClose, onPrevious, onNext }: MediaViewerProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="relative flex max-h-full w-full max-w-5xl flex-col gap-3">
        <div className="flex items-center justify-between gap-2 text-white">
          <p className="truncate text-sm">{asset.originalFileName}</p>
          <div className="flex items-center gap-2">
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
        <div className="relative flex min-h-[40vh] flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">
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
      </div>
    </div>
  );
}
