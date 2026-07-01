"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { R2_ASSET_PREFIX } from "@/lib/r2-assets";
import { cn } from "@/lib/utils";

function shouldResolveAssetReference(value: string) {
  if (value.startsWith(R2_ASSET_PREFIX)) return true;
  return !/^https?:\/\//i.test(value);
}

export function useResolvedAssetUrl(storedValue: string | undefined) {
  const trimmed = storedValue?.trim() ?? "";
  const needsResolve = trimmed.length > 0 && shouldResolveAssetReference(trimmed);
  const resolved = useQuery(
    api.inventoryR2.resolveAssetUrl,
    needsResolve ? { value: trimmed } : "skip",
  );

  if (!trimmed) return undefined;
  if (!needsResolve) return trimmed;
  return resolved ?? undefined;
}

export function InventoryAssetImage({
  storedValue,
  alt = "",
  className,
  fallbackClassName,
}: {
  storedValue?: string;
  alt?: string;
  className?: string;
  fallbackClassName?: string;
}) {
  const trimmed = storedValue?.trim() ?? "";
  const src = useResolvedAssetUrl(storedValue);

  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- resolved R2/signed URLs are dynamic
    return <img src={src} alt={alt} className={className} />;
  }

  if (!trimmed) return null;

  return (
    <div
      className={cn(
        "flex items-center justify-center bg-muted text-[10px] text-muted-foreground",
        fallbackClassName ?? className,
      )}
      aria-hidden={!alt}
    >
      …
    </div>
  );
}
