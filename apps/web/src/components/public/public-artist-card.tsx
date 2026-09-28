import Link from "next/link";
import { ArrowSquareOutIcon, MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { OptimizedRemoteImage } from "@/components/media/optimized-remote-image";
import { ArtistTypeBadge } from "@/components/public/artist-type-badge";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PublicEventArtist = {
  key: string;
  /** `act`: on the platform. `outside`: named on its position. `tba`: open position. */
  kind: "act" | "outside" | "tba";
  organizationId?: string;
  name: string;
  role: "headliner" | "support" | "other";
  slug?: string;
  organizationType?: "band" | "dj" | "singer_songwriter" | "other";
  genres: string[];
  oneLiner?: string;
  imageUrl?: string;
  links: { label: string; url: string }[];
  setStartsAt?: number;
  setEndsAt?: number;
};

function setTimeLabel(artist: Pick<PublicEventArtist, "setStartsAt" | "setEndsAt">) {
  if (artist.setStartsAt == null) return null;
  return artist.setEndsAt != null
    ? `${formatTime(artist.setStartsAt)} – ${formatTime(artist.setEndsAt)}`
    : formatTime(artist.setStartsAt);
}

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
    <Card className={cn("relative px-4 py-3", className)}>
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
            {artist.kind === "act" ? (
              <span className="border border-border px-2 py-0.5 text-2xs uppercase tracking-wide text-muted-foreground">
                {ROLE_LABELS[artist.role]}
              </span>
            ) : null}
            {artist.kind === "act" || artist.organizationType !== "other" ? (
              <ArtistTypeBadge organizationType={artist.organizationType} />
            ) : null}
          </div>
          {setTimeLabel(artist) ? (
            <p className="text-sm text-muted-foreground tabular-nums">{setTimeLabel(artist)}</p>
          ) : null}
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
                  className="relative z-10 inline-flex items-center gap-1 text-primary hover:underline"
                >
                  {link.label}
                  <ArrowSquareOutIcon className="size-3" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {artist.slug ? (
        <Link
          href={`/artists/${artist.slug}`}
          aria-label={`View ${artist.name}`}
          className="absolute inset-0 z-0"
        />
      ) : null}
    </Card>
  );
}

/** The bill in show order: platform acts, outside acts, and positions still to be announced. */
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
        {artists.map((artist) =>
          artist.kind === "tba" ? (
            <PublicArtistTbd key={artist.key} artist={artist} />
          ) : (
            <PublicArtistCard key={artist.key} artist={artist} />
          ),
        )}
      </div>
    </div>
  );
}

/** An open position: named by its label ("Opener") when it has one, with its set time. */
export function PublicArtistTbd({
  artist,
  className,
}: {
  artist?: Pick<PublicEventArtist, "name" | "setStartsAt" | "setEndsAt">;
  className?: string;
}) {
  const time = artist ? setTimeLabel(artist) : null;
  const label = artist && artist.name !== "To be announced" ? artist.name : null;
  return (
    <Card className={cn("px-4 py-3", className)}>
      <div className="flex items-start gap-3">
        <span className="flex size-12 shrink-0 items-center justify-center bg-muted text-muted-foreground">
          <MagnifyingGlassIcon className="size-5" />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-heading text-sm font-medium">
              {label ? `${label} · to be announced` : "Artist to be determined"}
            </span>
          </div>
          {time ? <p className="text-sm text-muted-foreground tabular-nums">{time}</p> : null}
          <p className="text-sm/relaxed text-muted-foreground">
            We&apos;re currently searching for an act to fill this slot — we&apos;ll keep you
            updated.
          </p>
        </div>
      </div>
    </Card>
  );
}
