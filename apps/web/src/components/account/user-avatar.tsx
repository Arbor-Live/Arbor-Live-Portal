"use client";

/**
 * User avatars — single source of truth for photo + Boring Avatar fallbacks.
 *
 * Seed (stable; must not change when the user edits display name or calendar
 * invite email):
 *   1. account email (preferred in the portal)
 *   2. user id (public pages / when email is not available)
 *   3. display name (last resort)
 *   4. "arbor"
 *
 * Always render fallbacks via `BoringUserAvatar` / `UserAvatar` — do not import
 * `boring-avatars` directly in feature code.
 */

import BoringAvatar from "boring-avatars";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Shared Boring Avatar palette (portal + public). */
export const AVATAR_COLORS = ["#0D9488", "#334155", "#7C3AED", "#EA580C", "#16A34A"];

export type BoringAvatarIdentity = {
  email?: string | null;
  userId?: string | null;
  name?: string | null;
};

/** Stable Boring Avatar seed — see module docs above. */
export function boringAvatarSeed(identity: BoringAvatarIdentity): string {
  const email = identity.email?.trim().toLowerCase();
  if (email) return email;
  const userId = identity.userId?.trim();
  if (userId) return userId;
  const name = identity.name?.trim();
  if (name) return name;
  return "arbor";
}

type BoringUserAvatarProps = BoringAvatarIdentity & {
  size: number;
  className?: string;
};

export function BoringUserAvatar({
  email,
  userId,
  name,
  size,
  className,
}: BoringUserAvatarProps) {
  return (
    <div
      className={cn("overflow-hidden [&_svg]:!size-full", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <BoringAvatar
        size={size}
        name={boringAvatarSeed({ email, userId, name })}
        variant="beam"
        colors={AVATAR_COLORS}
      />
    </div>
  );
}

type UserAvatarProps = {
  name: string;
  email: string;
  userId?: string | null;
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
  userId,
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
    <BoringUserAvatar
      email={email}
      userId={userId}
      name={name}
      size={resolvedPixelSize}
      className={cn("rounded-lg", sizeClasses[size], className)}
    />
  );
}

export function UserAvatarUploadPreview({
  name,
  email,
  userId,
  imageUrl,
  className,
}: {
  name: string;
  email: string;
  userId?: string | null;
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
    <BoringUserAvatar
      email={email}
      userId={userId}
      name={name}
      size={96}
      className={cn("rounded-lg border", className)}
    />
  );
}
