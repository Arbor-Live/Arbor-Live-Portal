"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { useAction, useQuery } from "convex/react";
import { ArrowLeftIcon, CircleNotchIcon, ImagesIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePickerField } from "@/components/ui/date-picker";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type LibraryAsset = {
  id: string;
  originalFileName: string;
  createdAt: number;
  thumbnailDataUrl: string;
};

type AlbumSummary = {
  id: string;
  albumName: string;
  assetCount: number;
  thumbnailDataUrl?: string;
};

type BrowseMode = "recent" | "date" | "album";

type BrowseFilters = {
  takenFrom?: string;
  takenTo?: string;
  albumId?: string;
};

type ImmichLibraryPickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postId?: string;
  imageKind: "hero" | "content";
  onImported: (storedValue: string, originalFileName: string) => void;
};

function formatAssetDate(timestamp: number) {
  return new Date(timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const modeLabels: Record<BrowseMode, string> = {
  recent: "Recent",
  date: "By date",
  album: "By album",
};

export function ImmichLibraryPicker({
  open,
  onOpenChange,
  postId,
  imageKind,
  onImported,
}: ImmichLibraryPickerProps) {
  const available = useQuery(api.marketingImmich.isLibraryAvailable, {});
  const browseLibrary = useAction(api.marketingImmichActions.browseLibrary);
  const listAlbums = useAction(api.marketingImmichActions.listAlbums);
  const importImage = useAction(api.marketingImmichActions.importImage);

  const [mode, setMode] = useState<BrowseMode>("recent");
  const [items, setItems] = useState<LibraryAsset[]>([]);
  const [nextPage, setNextPage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activeDateFrom, setActiveDateFrom] = useState("");
  const [activeDateTo, setActiveDateTo] = useState("");

  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [albumNextPage, setAlbumNextPage] = useState<string | null>(null);
  const [albumQueryInput, setAlbumQueryInput] = useState("");
  const [activeAlbumQuery, setActiveAlbumQuery] = useState("");
  const [loadingAlbums, setLoadingAlbums] = useState(false);
  const [loadingMoreAlbums, setLoadingMoreAlbums] = useState(false);
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumSummary | null>(null);

  const loadAssets = useCallback(
    async (page: number, filters: BrowseFilters, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const result = await browseLibrary({
          page,
          albumId: filters.albumId,
          takenFrom: filters.takenFrom,
          takenTo: filters.takenTo,
        });
        setItems((current) => (append ? [...current, ...result.items] : result.items));
        setNextPage(result.nextPage);
      } catch (browseError) {
        setError(getConvexErrorMessage(browseError));
        if (!append) setItems([]);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [browseLibrary],
  );

  const loadAlbums = useCallback(
    async (page: number, query: string, append: boolean) => {
      if (append) {
        setLoadingMoreAlbums(true);
      } else {
        setLoadingAlbums(true);
      }
      setError(null);
      try {
        const result = await listAlbums({
          page,
          query: query || undefined,
        });
        setAlbums((current) => (append ? [...current, ...result.items] : result.items));
        setAlbumNextPage(result.nextPage);
      } catch (albumError) {
        setError(getConvexErrorMessage(albumError));
        if (!append) setAlbums([]);
      } finally {
        setLoadingAlbums(false);
        setLoadingMoreAlbums(false);
      }
    },
    [listAlbums],
  );

  function currentAssetFilters(): BrowseFilters {
    if (mode === "album" && selectedAlbum) {
      return { albumId: selectedAlbum.id };
    }
    if (mode === "date" && activeDateFrom) {
      return { takenFrom: activeDateFrom, takenTo: activeDateTo || activeDateFrom };
    }
    return {};
  }

  function resetState() {
    setMode("recent");
    setItems([]);
    setNextPage(null);
    setError(null);
    setImportingId(null);
    setDateFrom("");
    setDateTo("");
    setActiveDateFrom("");
    setActiveDateTo("");
    setAlbums([]);
    setAlbumNextPage(null);
    setAlbumQueryInput("");
    setActiveAlbumQuery("");
    setSelectedAlbum(null);
  }

  function openBrowseMode(nextMode: BrowseMode) {
    setMode(nextMode);
    setItems([]);
    setNextPage(null);
    setError(null);
    setSelectedAlbum(null);

    if (nextMode === "recent") {
      void loadAssets(1, {}, false);
      return;
    }
    if (nextMode === "album") {
      setAlbums([]);
      setAlbumNextPage(null);
      void loadAlbums(1, activeAlbumQuery, false);
    }
  }

  function handleOpenChange(next: boolean) {
    if (next) {
      if (available === true) {
        void loadAssets(1, {}, false);
      }
    } else {
      resetState();
    }
    onOpenChange(next);
  }

  function applyDateFilter() {
    if (!dateFrom.trim()) {
      setError("Choose a start date.");
      return;
    }
    setActiveDateFrom(dateFrom);
    setActiveDateTo(dateTo || dateFrom);
    setError(null);
    void loadAssets(1, { takenFrom: dateFrom, takenTo: dateTo || dateFrom }, false);
  }

  function selectAlbum(album: AlbumSummary) {
    setSelectedAlbum(album);
    setItems([]);
    setNextPage(null);
    void loadAssets(1, { albumId: album.id }, false);
  }

  function backToAlbumList() {
    setSelectedAlbum(null);
    setItems([]);
    setNextPage(null);
    if (!albums.length) {
      void loadAlbums(1, activeAlbumQuery, false);
    }
  }

  async function handleImport(asset: LibraryAsset) {
    setImportingId(asset.id);
    setError(null);
    try {
      const storedValue = await importImage({
        immichAssetId: asset.id,
        postId,
        imageKind,
        originalFileName: asset.originalFileName,
      });
      onImported(storedValue, asset.originalFileName);
      handleOpenChange(false);
    } catch (importError) {
      setError(getConvexErrorMessage(importError));
    } finally {
      setImportingId(null);
    }
  }

  const nextAssetPage = nextPage ? Number.parseInt(nextPage, 10) : null;
  const nextAlbumPage = albumNextPage ? Number.parseInt(albumNextPage, 10) : null;
  const showingAlbumPicker = mode === "album" && !selectedAlbum;
  const showingAssets = mode === "recent" || mode === "date" || selectedAlbum !== null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Import from Immich</SheetTitle>
          <SheetDescription>
            Browse photos from the Immich account linked to the portal API key.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 pb-4">
          {available === false ? (
            <p className="text-sm text-muted-foreground">
              Immich is not configured for this environment.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(modeLabels) as BrowseMode[]).map((option) => (
                  <Button
                    key={option}
                    type="button"
                    size="sm"
                    variant={mode === option ? "default" : "outline"}
                    onClick={() => openBrowseMode(option)}
                  >
                    {modeLabels[option]}
                  </Button>
                ))}
              </div>

              {mode === "date" ? (
                <div className="space-y-3 rounded-md border p-3">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>From</Label>
                      <DatePickerField value={dateFrom} onChange={setDateFrom} placeholder="Start date" />
                    </div>
                    <div className="space-y-2">
                      <Label>To (optional)</Label>
                      <DatePickerField value={dateTo} onChange={setDateTo} placeholder="End date" />
                    </div>
                  </div>
                  <Button type="button" size="sm" disabled={loading} onClick={applyDateFilter}>
                    Show photos
                  </Button>
                </div>
              ) : null}

              {showingAlbumPicker ? (
                <div className="space-y-3">
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const query = albumQueryInput.trim();
                      setActiveAlbumQuery(query);
                      void loadAlbums(1, query, false);
                    }}
                  >
                    <Input
                      value={albumQueryInput}
                      onChange={(event) => setAlbumQueryInput(event.target.value)}
                      placeholder="Filter albums by name…"
                    />
                    <Button type="submit" variant="outline" disabled={loadingAlbums}>
                      Search
                    </Button>
                  </form>

                  <div className="min-h-0 max-h-72 overflow-y-auto">
                    {loadingAlbums && albums.length === 0 ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <CircleNotchIcon className="size-4 animate-spin" />
                        Loading albums…
                      </div>
                    ) : null}

                    {!loadingAlbums && albums.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No albums found.</p>
                    ) : null}

                    <div className="space-y-2">
                      {albums.map((album) => (
                        <button
                          key={album.id}
                          type="button"
                          onClick={() => selectAlbum(album)}
                          className="flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition-colors hover:bg-muted/50"
                        >
                          <div className="relative size-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                            {album.thumbnailDataUrl ? (
                              <Image
                                src={album.thumbnailDataUrl}
                                alt=""
                                fill
                                unoptimized
                                className="object-cover"
                                sizes="48px"
                              />
                            ) : (
                              <div className="flex size-full items-center justify-center text-muted-foreground">
                                <ImagesIcon className="size-5" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{album.albumName}</p>
                            <p className="text-xs text-muted-foreground">
                              {album.assetCount} photo{album.assetCount === 1 ? "" : "s"}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>

                    {nextAlbumPage && Number.isFinite(nextAlbumPage) ? (
                      <div className="mt-3 flex justify-center">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={loadingMoreAlbums}
                          onClick={() => void loadAlbums(nextAlbumPage, activeAlbumQuery, true)}
                        >
                          {loadingMoreAlbums ? "Loading…" : "Load more albums"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {selectedAlbum ? (
                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={backToAlbumList}>
                    <ArrowLeftIcon className="size-4" />
                    Albums
                  </Button>
                  <p className="truncate text-sm font-medium">{selectedAlbum.albumName}</p>
                </div>
              ) : null}

              {error ? <p className="text-sm text-destructive">{error}</p> : null}

              {showingAssets ? (
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {loading && items.length === 0 ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CircleNotchIcon className="size-4 animate-spin" />
                      Loading photos…
                    </div>
                  ) : null}

                  {!loading && items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {mode === "date" && !activeDateFrom
                        ? "Pick a date range and click Show photos."
                        : "No images found."}
                    </p>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {items.map((asset) => (
                      <button
                        key={asset.id}
                        type="button"
                        disabled={importingId !== null}
                        onClick={() => void handleImport(asset)}
                        className={cn(
                          "group relative aspect-square overflow-hidden rounded-md border bg-muted text-left",
                          importingId === asset.id && "ring-2 ring-primary",
                        )}
                      >
                        <Image
                          src={asset.thumbnailDataUrl}
                          alt={asset.originalFileName}
                          fill
                          unoptimized
                          className="object-cover transition-transform group-hover:scale-105"
                          sizes="160px"
                        />
                        <span className="absolute inset-x-0 bottom-0 bg-black/60 px-1.5 py-1 text-[10px] text-white">
                          {importingId === asset.id
                            ? "Importing…"
                            : formatAssetDate(asset.createdAt)}
                        </span>
                      </button>
                    ))}
                  </div>

                  {nextAssetPage && Number.isFinite(nextAssetPage) ? (
                    <div className="mt-4 flex justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loadingMore}
                        onClick={() => void loadAssets(nextAssetPage, currentAssetFilters(), true)}
                      >
                        {loadingMore ? "Loading…" : "Load more"}
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ImmichImportButton({
  postId,
  imageKind,
  disabled,
  onImported,
  className,
}: {
  postId?: string;
  imageKind: "hero" | "content";
  disabled?: boolean;
  onImported: (storedValue: string, originalFileName: string) => void;
  className?: string;
}) {
  const available = useQuery(api.marketingImmich.isLibraryAvailable, {});
  const [open, setOpen] = useState(false);

  if (available !== true) return null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        className={className}
        onClick={() => setOpen(true)}
      >
        Immich
      </Button>
      <ImmichLibraryPicker
        open={open}
        onOpenChange={setOpen}
        postId={postId}
        imageKind={imageKind}
        onImported={onImported}
      />
    </>
  );
}
