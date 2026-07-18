import { PosterPlaceholder } from "@/components/public/poster-placeholder";

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
    return <img src={imageUrl} alt="" className={`aspect-[4/5] object-cover ${className}`} />;
  }

  return (
    <PosterPlaceholder
      seed={seed}
      title={title}
      logoSrc="/arbor-artist.svg"
      className={`aspect-[4/5] ${className}`}
    />
  );
}
