"use client";

import { posterPlaceholderPath, type PosterPlaceholderVariant } from "@/lib/poster-placeholder-svg";
import { cn } from "@/lib/utils";

type PosterPlaceholderImageProps = {
  seed: string;
  title?: string;
  variant?: PosterPlaceholderVariant;
  className?: string;
};

/**
 * Theme is applied via `html.dark` CSS, not JS — avoids SSR always baking `theme=light`
 * into the image URL.
 */
export function PosterPlaceholderImage({
  seed,
  title,
  variant = "event",
  className,
}: PosterPlaceholderImageProps) {
  const lightSrc = posterPlaceholderPath(seed, { theme: "light", variant });
  const darkSrc = posterPlaceholderPath(seed, { theme: "dark", variant });
  const alt = title || "";

  return (
    <span className={cn("relative block aspect-[4/5] overflow-hidden", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- cached SVG route */}
      <img
        src={lightSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 size-full object-cover dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- cached SVG route */}
      <img
        src={darkSrc}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="absolute inset-0 hidden size-full object-cover dark:block"
      />
    </span>
  );
}
