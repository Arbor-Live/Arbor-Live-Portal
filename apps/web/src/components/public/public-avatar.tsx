"use client";

import Image from "next/image";
import BoringAvatar from "boring-avatars";
import { useResolvedAssetUrl } from "@/components/files/stored-asset-image";
import { cn } from "@/lib/utils";

type PublicAvatarProps = {
  name: string;
  imageUrl?: string;
  className?: string;
  size?: number;
};

export function PublicAvatar({ name, imageUrl, className, size = 96 }: PublicAvatarProps) {
  const resolvedImageUrl = useResolvedAssetUrl(imageUrl);

  if (resolvedImageUrl) {
    return (
      <Image
        src={resolvedImageUrl}
        alt=""
        width={size}
        height={size}
        sizes={`${size}px`}
        className={cn("rounded-none object-cover ring-1 ring-foreground/10", className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={cn("overflow-hidden rounded-none ring-1 ring-foreground/10", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <BoringAvatar
        size={size}
        name={name}
        variant="beam"
        colors={["#3d7a5c", "#1a3d2e", "#6b9e7a", "#0f1f17", "#a8d5ba"]}
      />
    </div>
  );
}
