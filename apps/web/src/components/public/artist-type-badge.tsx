import type { Icon } from "@phosphor-icons/react";
import {
  MicrophoneStageIcon,
  MusicNotesIcon,
  UsersThreeIcon,
  VinylRecordIcon,
} from "@phosphor-icons/react/dist/ssr";
import { ARTIST_TYPE_LABELS, type ArtistType } from "@/lib/artist-types";
import { cn } from "@/lib/utils";

const ARTIST_TYPE_ICONS: Record<ArtistType, Icon> = {
  band: UsersThreeIcon,
  dj: VinylRecordIcon,
  singer_songwriter: MicrophoneStageIcon,
  other: MusicNotesIcon,
};

function normalize(value: string | undefined): ArtistType {
  return value && value in ARTIST_TYPE_ICONS ? (value as ArtistType) : "other";
}

export function ArtistTypeBadge({
  artistType,
  showLabel = true,
  className,
}: {
  artistType: string | undefined;
  showLabel?: boolean;
  className?: string;
}) {
  const type = normalize(artistType);
  const Icon = ARTIST_TYPE_ICONS[type];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {showLabel ? ARTIST_TYPE_LABELS[type] : <span className="sr-only">{ARTIST_TYPE_LABELS[type]}</span>}
    </span>
  );
}
