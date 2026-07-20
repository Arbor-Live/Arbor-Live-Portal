import { PosterPlaceholder } from "@/components/public/poster-placeholder";

type PublicEventPosterProps = {
  imageUrl?: string;
  eventId: string;
  className?: string;
};

export function PublicEventPoster({ imageUrl, eventId, className = "" }: PublicEventPosterProps) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed or unknown hosts
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`aspect-[4/5] object-cover ${className}`}
      />
    );
  }

  return <PosterPlaceholder seed={eventId} className={`aspect-[4/5] ${className}`} />;
}
