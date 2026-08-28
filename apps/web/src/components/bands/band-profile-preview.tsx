"use client";

import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { StoredAssetImage } from "@/components/files/stored-asset-image";
import { PublicArtistPoster } from "@/components/public/public-artist-poster";
import { cn } from "@/lib/utils";
import { parseCommaList } from "@/lib/band-profile-lists";

export type BandProfilePreviewData = {
  displayName: string;
  oneLiner?: string;
  bio?: string;
  genres?: string;
  demoURL?: string;
  publicHeroImageUrl?: string;
  publicSlug?: string;
  publicWebsiteUrl?: string;
  publicInstagramUrl?: string;
  publicYoutubeUrl?: string;
  publicSpotifyUrl?: string;
  publicListing?: boolean;
};

function bioExcerpt(bio: string | undefined, maxLen = 140) {
  const text = bio?.trim();
  if (!text) return undefined;
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen).trimEnd()}…`;
}

function PreviewLabel({ children }: { children: React.ReactNode }) {
  return (
    <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
      {children}
    </Label>
  );
}

export function BandProfileCardPreview({
  data,
  heroUrl,
  className,
}: {
  data: BandProfilePreviewData;
  heroUrl?: string;
  className?: string;
}) {
  const genres = parseCommaList(data.genres);
  const slug = data.publicSlug?.trim() || "your-band";
  const displayName = data.displayName.trim() || "Your band name";

  return (
    <div className={cn("space-y-2", className)}>
      <PreviewLabel>Directory card</PreviewLabel>
      <Card className="gap-0 overflow-hidden border border-border/50 bg-background/70 py-0 shadow-sm ring-0">
        <PublicArtistPoster
          imageUrl={heroUrl}
          seed={slug}
          title={displayName}
          className="w-full"
        />
        <CardContent className="space-y-2 p-4">
          <h3 className="truncate font-semibold text-foreground">{displayName}</h3>
          {data.oneLiner?.trim() ? (
            <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
              {data.oneLiner.trim()}
            </p>
          ) : data.bio?.trim() ? (
            <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
              {bioExcerpt(data.bio)}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Add a headline or bio</p>
          )}
          {genres.length > 0 ? (
            <p className="line-clamp-1 text-xs text-muted-foreground">{genres.join(" · ")}</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function BandProfilePagePreview({
  data,
  heroUrl,
  className,
}: {
  data: BandProfilePreviewData;
  heroUrl?: string;
  className?: string;
}) {
  const genres = parseCommaList(data.genres);
  const displayName = data.displayName.trim() || "Your band name";
  const links = [
    { label: "Demo", url: data.demoURL },
    { label: "Website", url: data.publicWebsiteUrl },
    { label: "Instagram", url: data.publicInstagramUrl },
    { label: "YouTube", url: data.publicYoutubeUrl },
    { label: "Spotify", url: data.publicSpotifyUrl },
  ].filter((link) => link.url?.trim());

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <PreviewLabel>Profile page</PreviewLabel>
      <div className="max-w-full overflow-hidden border bg-background shadow-sm">
        <div className="relative h-28 overflow-hidden bg-zinc-950 text-zinc-50">
          <div
            aria-hidden
            className={cn(
              "absolute inset-0 bg-gradient-to-br from-emerald-900/80 via-primary/40 to-zinc-900",
              heroUrl && "opacity-40",
            )}
          />
          {heroUrl ? (
            <StoredAssetImage
              storedValue={data.publicHeroImageUrl}
              className="absolute inset-0 size-full object-cover opacity-50"
            />
          ) : null}
          <div className="relative flex h-full flex-col justify-end px-3 py-3">
            <p className="truncate text-[10px] text-zinc-400">← All artists</p>
            <h2 className="truncate text-base font-semibold tracking-tight">{displayName}</h2>
            {data.oneLiner?.trim() ? (
              <p className="line-clamp-2 text-xs text-zinc-200">{data.oneLiner.trim()}</p>
            ) : null}
          </div>
        </div>
        <div className="space-y-2 p-3">
          {data.bio?.trim() ? (
            <p className="line-clamp-4 text-xs leading-relaxed break-words text-muted-foreground whitespace-pre-wrap">
              {data.bio.trim()}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">No bio yet.</p>
          )}
          {genres.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {genres.slice(0, 4).map((genre) => (
                <Badge key={genre} variant="outline" className="text-[10px]">
                  {genre}
                </Badge>
              ))}
            </div>
          ) : null}
          {links.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {links.map((link) => (
                <Badge key={link.label} variant="outline" className="text-[10px]">
                  {link.label} ↗
                </Badge>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function BandProfilePreviewPanel({
  data,
  heroUrl,
  className,
}: {
  data: BandProfilePreviewData;
  heroUrl?: string;
  className?: string;
}) {
  const listed = Boolean(data.publicListing);

  return (
    <div className={cn("min-w-0 space-y-4", className)}>
      <div className="flex flex-col gap-1">
        <CardTitle className="text-sm">Live preview</CardTitle>
        <CardDescription>
          {listed
            ? "This is how you appear on the public artists page."
            : "Internal only — Arbor staff can see this info, but it is not listed publicly."}
        </CardDescription>
      </div>
      <ScrollArea className="max-h-[min(70vh,640px)]">
        <div className="flex flex-col gap-4 pr-3">
          <BandProfileCardPreview data={data} heroUrl={heroUrl} />
          <BandProfilePagePreview data={data} heroUrl={heroUrl} />
        </div>
      </ScrollArea>
    </div>
  );
}
