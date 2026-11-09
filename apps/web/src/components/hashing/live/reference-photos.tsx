"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { CameraIcon, CaretLeftIcon, CaretRightIcon, ClockIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useR2FileUpload } from "@/hooks/use-r2-file-upload";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { PHOTO_LEVEL_LABELS } from "@/lib/hashing";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

type Photo = FunctionReturnType<typeof api.hashingPhotos.forHash>["photos"][number];
export type PhotoLevel = Photo["level"];

export type PhotoTarget = { level: PhotoLevel; targetId: string; label: string };
/**
 * What a photo can be added to from a given spot: the item, its kit, its area. From a
 * kit or area header there is no one item, so `items` lists the rows to pick from.
 */
export type PhotoChoices = { item?: PhotoTarget; items?: PhotoTarget[]; kit?: PhotoTarget; area: PhotoTarget };

type Viewing = { level: PhotoLevel; targetId: string; title: string; choices?: PhotoChoices; index: number };
type Adding = { choices: PhotoChoices; level: PhotoLevel };

type Context = {
  canWork: boolean;
  photosFor: (level: PhotoLevel, targetId: string) => Photo[];
  openViewer: (level: PhotoLevel, targetId: string, title: string, choices?: PhotoChoices) => void;
  openAdd: (choices: PhotoChoices, level: PhotoLevel) => void;
};

const ReferencePhotosContext = createContext<Context | null>(null);

function useReferencePhotos() {
  const context = useContext(ReferencePhotosContext);
  if (!context) throw new Error("useReferencePhotos must be used within ReferencePhotosProvider");
  return context;
}

const keyOf = (level: PhotoLevel, targetId: string) => `${level}:${targetId}`;

export function ReferencePhotosProvider({
  hashDateId,
  canWork,
  children,
}: {
  hashDateId: Id<"hashDates">;
  canWork: boolean;
  children: React.ReactNode;
}) {
  const data = useQuery(api.hashingPhotos.forHash, { hashDateId });
  const [adding, setAdding] = useState<Adding | null>(null);
  const openAdd = useCallback((choices: PhotoChoices, level: PhotoLevel) => setAdding({ choices, level }), []);

  return (
    <PhotosShell photos={data?.photos} canReview={data?.canReview ?? false} canWork={canWork} onAdd={openAdd}>
      {children}
      <AddPhotoSheet hashDateId={hashDateId} state={adding} onClose={() => setAdding(null)} />
    </PhotosShell>
  );
}

/** The checklist editor's photos: approved only, with Remove, and no adding from the viewer. */
export function SetupReferencePhotosProvider({ children }: { children: React.ReactNode }) {
  const photos = useQuery(api.hashingPhotos.forChecklist, {});
  return (
    <PhotosShell photos={photos} canReview canWork={false}>
      {children}
    </PhotosShell>
  );
}

function PhotosShell({
  photos,
  canReview,
  canWork,
  onAdd,
  children,
}: {
  photos: Photo[] | undefined;
  canReview: boolean;
  canWork: boolean;
  onAdd?: (choices: PhotoChoices, level: PhotoLevel) => void;
  children: React.ReactNode;
}) {
  const [viewing, setViewing] = useState<Viewing | null>(null);

  const byTarget = useMemo(() => {
    const map = new Map<string, Photo[]>();
    for (const photo of photos ?? []) {
      const key = keyOf(photo.level, photo.targetId);
      map.set(key, [...(map.get(key) ?? []), photo]);
    }
    // The photo everyone can see leads; a waiting one of yours follows.
    for (const list of map.values()) list.sort((a, b) => Number(a.status === "pending") - Number(b.status === "pending"));
    return map;
  }, [photos]);

  const context = useMemo<Context>(
    () => ({
      canWork,
      photosFor: (level, targetId) => byTarget.get(keyOf(level, targetId)) ?? [],
      openViewer: (level, targetId, title, choices) => setViewing({ level, targetId, title, choices, index: 0 }),
      openAdd: (choices, level) => onAdd?.(choices, level),
    }),
    [byTarget, canWork, onAdd],
  );

  const viewed = viewing ? (byTarget.get(keyOf(viewing.level, viewing.targetId)) ?? []) : [];

  return (
    <ReferencePhotosContext.Provider value={context}>
      {children}
      <PhotoViewer
        photos={viewed}
        state={viewing}
        canWork={canWork}
        canReview={canReview}
        onClose={() => setViewing(null)}
        onIndex={(index) => setViewing((current) => (current ? { ...current, index } : current))}
        onAdd={() => {
          if (!viewing?.choices) return;
          onAdd?.(viewing.choices, viewing.level);
          setViewing(null);
        }}
      />
    </ReferencePhotosContext.Provider>
  );
}

function Thumb({ photo, className, count }: { photo: Photo; className?: string; count: number }) {
  const pending = photo.status === "pending";
  return (
    <span className={cn("relative block shrink-0 overflow-hidden bg-muted", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt="" className={cn("size-full object-cover", pending && "opacity-60")} />
      {pending ? (
        <span className="absolute right-0.5 bottom-0.5 flex size-4 items-center justify-center bg-background/90" aria-label="In review">
          <ClockIcon className="size-3" aria-hidden />
        </span>
      ) : null}
      {count > 1 ? (
        <span className="absolute top-0 right-0 bg-foreground px-1 text-3xs leading-4 font-medium text-background tabular-nums">
          {count}
        </span>
      ) : null}
    </span>
  );
}

export function PhotoThumbButton({
  level,
  targetId,
  title,
  choices,
  className,
  thumbClassName = "size-10",
}: {
  level: PhotoLevel;
  targetId: string;
  title: string;
  choices?: PhotoChoices;
  className?: string;
  thumbClassName?: string;
}) {
  const refs = useReferencePhotos();
  const photos = refs.photosFor(level, targetId);
  const first = photos[0];
  if (!first) return null;
  return (
    <button
      type="button"
      aria-label={`Reference photos for ${title}`}
      className={className}
      onClick={() => refs.openViewer(level, targetId, title, choices)}
    >
      <Thumb photo={first} count={photos.length} className={thumbClassName} />
    </button>
  );
}

/** Opens the camera sheet. Shown only where nothing is there yet, and only to people working the hash. */
export function AddPhotoButton({
  level,
  targetId,
  label,
  choices,
  className,
}: {
  level: PhotoLevel;
  targetId: string;
  label: string;
  choices: PhotoChoices;
  className?: string;
}) {
  const refs = useReferencePhotos();
  if (!refs.canWork || refs.photosFor(level, targetId).length > 0) return null;
  return (
    <button
      type="button"
      aria-label={`Add a photo to ${label}`}
      className={cn("flex shrink-0 items-center justify-center text-muted-foreground hover:bg-muted/30", className)}
      onClick={() => refs.openAdd(choices, level)}
    >
      <CameraIcon className="size-5" aria-hidden />
    </button>
  );
}

function PhotoViewer({
  photos,
  state,
  canWork,
  canReview,
  onClose,
  onIndex,
  onAdd,
}: {
  photos: Photo[];
  state: Viewing | null;
  canWork: boolean;
  canReview: boolean;
  onClose: () => void;
  onIndex: (index: number) => void;
  onAdd: () => void;
}) {
  const { confirm } = useAppDialog();
  const removePhoto = useMutation(api.hashingPhotos.remove);
  const [removing, setRemoving] = useState(false);
  const count = photos.length;
  const index = state ? Math.min(state.index, Math.max(count - 1, 0)) : 0;
  const photo = photos[index];

  async function remove(target: Photo) {
    const ok = await confirm({
      title: "Remove this photo?",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;
    setRemoving(true);
    try {
      await removePhoto({ photoId: target._id });
      notify.success("Photo removed.");
      if (count === 1) onClose();
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn't remove that photo."));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl" aria-describedby={undefined} data-testid="hash-photo-viewer">
        <DialogTitle className="px-4 pt-4 pr-12 text-base break-words">{state?.title}</DialogTitle>
        {photo ? (
          <div className="space-y-2 p-4">
            <div className="relative aspect-4/3 w-full overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="size-full object-cover" />
              {count > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    className="absolute top-1/2 left-2 flex size-10 -translate-y-1/2 items-center justify-center bg-background/80"
                    onClick={() => onIndex((index - 1 + count) % count)}
                  >
                    <CaretLeftIcon className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    className="absolute top-1/2 right-2 flex size-10 -translate-y-1/2 items-center justify-center bg-background/80"
                    onClick={() => onIndex((index + 1) % count)}
                  >
                    <CaretRightIcon className="size-5" />
                  </button>
                </>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {PHOTO_LEVEL_LABELS[photo.level]} · {photo.status === "pending" ? "In review" : photo.byName}
              </span>
              {count > 1 ? (
                <span className="tabular-nums">
                  {index + 1} of {count}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        {canWork || (canReview && photo?.status === "approved") ? (
          <div className="flex justify-end gap-2 border-t p-3">
            {canReview && photo?.status === "approved" ? (
              <Button
                variant="ghost"
                className="mr-auto h-11"
                disabled={removing}
                data-testid="hash-photo-remove"
                onClick={() => void remove(photo)}
              >
                Remove
              </Button>
            ) : null}
            {canWork ? (
              <Button variant="outline" className="h-11" onClick={onAdd} data-testid="hash-photo-viewer-add">
                <CameraIcon aria-hidden />
                Add a photo
              </Button>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AddPhotoSheet({
  hashDateId,
  state,
  onClose,
}: {
  hashDateId: Id<"hashDates">;
  state: Adding | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto" data-testid="hash-photo-add-sheet">
        <SheetHeader>
          <SheetTitle>Add a reference photo</SheetTitle>
          <SheetDescription className="sr-only">Take a photo and send it for review.</SheetDescription>
        </SheetHeader>
        {state ? <AddPhotoForm key={JSON.stringify(state)} hashDateId={hashDateId} state={state} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

const UPLOAD = { scope: "hashing" } as const;

function AddPhotoForm({
  hashDateId,
  state,
  onClose,
}: {
  hashDateId: Id<"hashDates">;
  state: Adding;
  onClose: () => void;
}) {
  const submit = useMutation(api.hashingPhotos.submit);
  const { uploadFile } = useR2FileUpload(UPLOAD);
  const { choices } = state;
  const items = choices.item ? [choices.item] : (choices.items ?? []);
  const levels = (["item", "kit", "area"] as const).filter((level) =>
    level === "item" ? items.length > 0 : choices[level],
  );
  const [level, setLevel] = useState<PhotoLevel>(levels.includes(state.level) ? state.level : levels[0]!);
  const [itemId, setItemId] = useState(choices.item?.targetId ?? "");
  const [picked, setPicked] = useState<{ file: File; preview: string } | null>(null);
  const [sending, setSending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const target = level === "item" ? items.find((item) => item.targetId === itemId) : choices[level];

  async function send() {
    if (!picked || !target) return;
    setSending(true);
    try {
      const photo = await uploadFile(picked.file);
      if (!photo) {
        notify.error("Couldn't upload that photo.");
        return;
      }
      await submit({ hashDateId, level: target.level, targetId: target.targetId, photo });
      notify.success("Sent for review.");
      onClose();
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn't send that photo."));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-4 px-4 pb-6">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        data-testid="hash-photo-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          if (picked) URL.revokeObjectURL(picked.preview);
          setPicked({ file, preview: URL.createObjectURL(file) });
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className="flex aspect-4/3 w-full items-center justify-center overflow-hidden border border-dashed bg-muted/30 text-muted-foreground"
        onClick={() => input.current?.click()}
      >
        {picked ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picked.preview} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm">
            <CameraIcon className="size-8" aria-hidden />
            Take photo
          </span>
        )}
      </button>
      {levels.length > 1 ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium" id="hash-photo-of">
            Photo of
          </p>
          <ToggleGroup
            type="single"
            variant="outline"
            value={level}
            onValueChange={(value) => value && setLevel(value as PhotoLevel)}
            aria-labelledby="hash-photo-of"
            className="w-full [&>button]:h-11 [&>button]:flex-1"
          >
            {levels.map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {PHOTO_LEVEL_LABELS[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ) : null}
      {level === "item" && !choices.item ? (
        <Select value={itemId} onValueChange={setItemId}>
          <SelectTrigger className="h-11 w-full" aria-label="Item" data-testid="hash-photo-item">
            <SelectValue placeholder="Which item?" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.targetId} value={item.targetId}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : target ? (
        <p className="text-sm break-words text-muted-foreground">{target.label}</p>
      ) : null}
      <div className="flex justify-end gap-2">
        {picked ? (
          <Button variant="ghost" className="mr-auto h-11" disabled={sending} onClick={() => input.current?.click()}>
            Retake
          </Button>
        ) : null}
        <Button variant="outline" className="h-11" disabled={sending} onClick={onClose}>
          Cancel
        </Button>
        <Button className="h-11" disabled={!picked || !target || sending} data-testid="hash-photo-submit" onClick={() => void send()}>
          Send for review
        </Button>
      </div>
    </div>
  );
}
