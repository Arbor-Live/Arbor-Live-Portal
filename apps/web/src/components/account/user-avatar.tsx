"use client";

import BoringAvatar from "boring-avatars";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const AVATAR_COLORS = ["#0D9488", "#334155", "#7C3AED", "#EA580C", "#16A34A"];

type UserAvatarProps = {
  name: string;
  email: string;
  imageUrl?: string | null;
  className?: string;
  size?: "sm" | "default" | "lg";
  pixelSize?: number;
};

const sizeClasses = {
  sm: "size-8",
  default: "size-10",
  lg: "size-16",
};

export function UserAvatar({
  name,
  email,
  imageUrl,
  className,
  size = "default",
  pixelSize,
}: UserAvatarProps) {
  const resolvedPixelSize = pixelSize ?? (size === "lg" ? 64 : size === "sm" ? 32 : 40);
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  if (imageUrl) {
    return (
      <Avatar className={cn(sizeClasses[size], className)} size={size}>
        <AvatarImage src={imageUrl} alt={name} />
        <AvatarFallback>{initials || "?"}</AvatarFallback>
      </Avatar>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg [&_svg]:!size-full",
        sizeClasses[size],
        className,
      )}
    >
      <BoringAvatar
        size={resolvedPixelSize}
        name={`${email}-${name}`}
        variant="beam"
        colors={AVATAR_COLORS}
      />
    </div>
  );
}

export function UserAvatarUploadPreview({
  name,
  email,
  imageUrl,
  className,
}: {
  name: string;
  email: string;
  imageUrl?: string | null;
  className?: string;
}) {
  if (imageUrl) {
    return (
      <div className={cn("relative size-24 overflow-hidden rounded-lg border", className)}>
        <Image src={imageUrl} alt={name} fill className="object-cover" unoptimized />
      </div>
    );
  }

  return (
    <div className={cn("size-24 overflow-hidden rounded-lg border", className)}>
      <BoringAvatar
        size={96}
        name={`${email}-${name}`}
        variant="beam"
        colors={AVATAR_COLORS}
      />
    </div>
  );
}
