import { PosterPlaceholderImage } from "@/components/public/poster-placeholder-image";

type PublicEventPosterProps = {
  imageUrl?: string;
  eventId: string;
  className?: string;
};

export function PublicEventPoster({ imageUrl, eventId, className = "" }: PublicEventPosterProps) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`aspect-[4/5] object-cover ${className}`}
      />
    );
  }

  return <PosterPlaceholderImage seed={eventId} variant="event" className={className} />;
}
