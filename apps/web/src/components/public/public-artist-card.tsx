import Link from "next/link";
import { ArrowSquareOutIcon } from "@phosphor-icons/react/dist/ssr";
import { Card, CardContent } from "@/components/ui/card";
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

export function PublicArtistCard({
  artist,
  className,
}: {
  artist: PublicEventArtist;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      {artist.imageUrl ? (
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          <OptimizedRemoteImage
            src={artist.imageUrl}
            alt=""
            fill
            sizes="(max-width: 768px) 100vw, 320px"
            className="object-cover"
          />
        </div>
      ) : null}
      <CardContent className="flex flex-1 flex-col gap-2 pt-4">
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
        {artist.oneLiner ? (
          <p className="text-sm/relaxed text-muted-foreground">{artist.oneLiner}</p>
        ) : null}
        {artist.links.length ? (
          <div className="mt-auto flex flex-wrap gap-3 pt-1 text-xs">
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
      </CardContent>
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
      <div className="grid gap-4 sm:grid-cols-2">
        {artists.map((artist) => (
          <PublicArtistCard key={artist.organizationId} artist={artist} />
        ))}
      </div>
    </div>
  );
}
