import Image from "next/image";
import { isOptimizableRemoteImageUrl } from "@/lib/remote-image";
import { cn } from "@/lib/utils";

type OptimizedRemoteImageProps = {
  src: string;
  alt: string;
  className?: string;
  fill?: boolean;
  width?: number;
  height?: number;
  sizes?: string;
  priority?: boolean;
};

export function OptimizedRemoteImage({
  src,
  alt,
  className,
  fill,
  width = 800,
  height = 600,
  sizes,
  priority = false,
}: OptimizedRemoteImageProps) {
  if (isOptimizableRemoteImageUrl(src)) {
    if (fill) {
      return (
        <Image
          src={src}
          alt={alt}
          fill
          className={className}
          sizes={sizes ?? "100vw"}
          priority={priority}
        />
      );
    }

    return (
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        className={className}
        sizes={sizes}
        priority={priority}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed or unknown hosts
    <img
      src={src}
      alt={alt}
      className={cn(className)}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
    />
  );
}
