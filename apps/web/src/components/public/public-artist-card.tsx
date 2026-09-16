import Link from "next/link";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { OptimizedRemoteImage } from "@/components/media/optimized-remote-image";
import { cn } from "@/lib/utils";

export type PublicEventArtist = {
  organizationId: string;
  name: string;
  role: "headliner" | "support" | "other";
  slug?: string;
  genres: string[];
  oneLiner?: string;
  imageUrl?: string;
  links: { label: string; url: string }[];
};

const ROLE_LABELS: Record<PublicEventArtist["role"], string> = {
  headliner: "Headliner",
  support: "Support",
  other: "Performer",
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

/** Compact artist row, sized like a notification card. */
export function PublicArtistCard({
  artist,
  className,
}: {
  artist: PublicEventArtist;
  className?: string;
}) {
  return (
    <Card className={cn("px-4 py-3", className)}>
      <div className="flex items-start gap-3">
        <div className="size-12 shrink-0 overflow-hidden bg-muted">
          {artist.imageUrl ? (
            <OptimizedRemoteImage
              src={artist.imageUrl}
              alt=""
              width={96}
              height={96}
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center font-heading text-sm font-medium text-muted-foreground">
              {initials(artist.name)}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-sm font-medium">
              {artist.slug ? (
                <Link href={`/artists/${artist.slug}`} className="hover:underline">
                  {artist.name}
                </Link>
              ) : (
                artist.name
              )}
            </span>
            <span className="border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
              {ROLE_LABELS[artist.role]}
            </span>
          </div>
          {artist.genres.length ? (
            <div className="flex flex-wrap gap-1.5">
              {artist.genres.map((genre) => (
                <span key={genre} className="bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {genre}
                </span>
              ))}
            </div>
          ) : null}
          {artist.links.length ? (
            <div className="flex flex-wrap gap-3 pt-0.5 text-xs">
              {artist.links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {link.label}
                  <ArrowSquareOutIcon className="size-3" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

export function PublicEventArtists({
  artists,
  title = "Artists",
  className,
}: {
  artists: PublicEventArtist[];
  title?: string;
  className?: string;
}) {
  if (!artists.length) return null;
  return (
    <div className={cn("space-y-3", className)}>
      <h2 className="font-heading text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="space-y-3">
        {artists.map((artist) => (
          <PublicArtistCard key={artist.organizationId} artist={artist} />
        ))}
      </div>
    </div>
  );
}
