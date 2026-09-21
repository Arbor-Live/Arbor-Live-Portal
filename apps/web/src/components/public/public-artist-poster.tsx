import { PosterPlaceholderImage } from "@/components/public/poster-placeholder-image";

type PublicArtistPosterProps = {
  imageUrl?: string;
  seed: string;
  title?: string;
  className?: string;
};

export function PublicArtistPoster({
  imageUrl,
  seed,
  title,
  className = "",
}: PublicArtistPosterProps) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" className={`aspect-(--aspect-poster) object-cover ${className}`} />;
  }

  return (
    <PosterPlaceholderImage
      seed={seed}
      title={title}
      variant="artist"
      className={className}
    />
  );
}
