import { PosterPlaceholder } from "@/components/public/poster-placeholder";

type PublicEventPosterProps = {
  imageUrl?: string;
  eventId: string;
  className?: string;
  /** Defaults to lazy; pass eager for above-the-fold carousel cards. */
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
};

export function PublicEventPoster({
  imageUrl,
  eventId,
  className = "",
  loading = "lazy",
  fetchPriority,
}: PublicEventPosterProps) {
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={imageUrl}
        alt=""
        loading={loading}
        decoding="async"
        fetchPriority={fetchPriority}
        className={`aspect-[4/5] object-cover ${className}`}
      />
    );
  }

  return <PosterPlaceholder seed={eventId} className={`aspect-[4/5] ${className}`} />;
}
