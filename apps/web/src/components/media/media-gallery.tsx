"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { MediaViewer } from "@/components/media/media-viewer";

export type MediaGalleryAsset = {
  immichAssetId: string;
  originalFileName: string;
  type: "IMAGE" | "VIDEO";
  thumbnailUrl: string;
  originalUrl: string;
  playbackUrl?: string;
};

type MediaGalleryProps = {
  assets: MediaGalleryAsset[];
  emptyMessage?: string;
  className?: string;
};

export function MediaGallery({
  assets,
  emptyMessage = "No photos or videos yet.",
  className,
}: MediaGalleryProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  if (!assets.length) {
    return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  }

  return (
    <>
      <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5", className)}>
        {assets.map((asset, index) => (
          <button
            key={asset.immichAssetId}
            type="button"
            className="group relative aspect-square overflow-hidden rounded-md border bg-muted"
            onClick={() => setActiveIndex(index)}
          >
            <Image
              src={asset.thumbnailUrl}
              alt={asset.originalFileName}
              fill
              unoptimized
              className="object-cover transition-transform group-hover:scale-105"
              sizes="(max-width: 768px) 50vw, 20vw"
            />
            {asset.type === "VIDEO" ? (
              <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">
                Video
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {activeIndex !== null ? (
        <MediaViewer
          asset={assets[activeIndex]}
          onClose={() => setActiveIndex(null)}
          onPrevious={
            activeIndex > 0 ? () => setActiveIndex((value) => (value === null ? null : value - 1)) : undefined
          }
          onNext={
            activeIndex < assets.length - 1
              ? () => setActiveIndex((value) => (value === null ? null : value + 1))
              : undefined
          }
        />
      ) : null}
    </>
  );
}
