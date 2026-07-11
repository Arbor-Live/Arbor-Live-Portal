import { ArrowSquareOutIcon } from "@phosphor-icons/react";

type MediaAlbumLinkProps = {
  albumName?: string;
  albumUrl?: string;
};

export function MediaAlbumLink({ albumName, albumUrl }: MediaAlbumLinkProps) {
  if (!albumUrl) return null;

  return (
    <a
      href={albumUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline"
    >
      <span>{albumName ? `Open “${albumName}” in Immich` : "Open album in Immich"}</span>
      <ArrowSquareOutIcon className="size-3.5" aria-hidden />
    </a>
  );
}
