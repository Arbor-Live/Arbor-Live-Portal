"use client";

import Image from "next/image";
import { BoringUserAvatar } from "@/components/account/user-avatar";
import { useResolvedAssetUrl } from "@/components/files/stored-asset-image";
import { cn } from "@/lib/utils";

type PublicAvatarProps = {
  name: string;
  /** Prefer user id for a stable Boring Avatar when no photo is set. */
  userId?: string;
  imageUrl?: string;
  className?: string;
  size?: number;
};

export function PublicAvatar({
  name,
  userId,
  imageUrl,
  className,
  size = 96,
}: PublicAvatarProps) {
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
    <BoringUserAvatar
      userId={userId}
      name={name}
      size={size}
      className={cn("rounded-none ring-1 ring-foreground/10", className)}
    />
  );
}
