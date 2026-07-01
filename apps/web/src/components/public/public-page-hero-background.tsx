"use client";

import { StoredAssetImage } from "@/components/files/stored-asset-image";

export function PublicPageHeroBackground({
  storedValue,
  className,
}: {
  storedValue: string;
  className?: string;
}) {
  return <StoredAssetImage storedValue={storedValue} alt="" className={className} />;
}
