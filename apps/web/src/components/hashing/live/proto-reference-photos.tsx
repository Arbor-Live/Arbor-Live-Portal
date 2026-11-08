"use client";

/**
 * PROTOTYPE ONLY (prototype/hash-reference-photos). Mock data and state; nothing
 * here talks to Convex. `?variant=1|2|3` on a live hash switches the crew UI.
 */

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CameraIcon, CaretLeftIcon, CaretRightIcon, ClockIcon, FlagIcon, ImageIcon, PlusIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";

export type ProtoVariant = 1 | 2 | 3;
export const PROTO_VARIANTS: { id: ProtoVariant; name: string }[] = [
  { id: 1, name: "Inline" },
  { id: 2, name: "Item sheet" },
  { id: 3, name: "Kit strip" },
];

export type PhotoLevel = "area" | "kit" | "item";
export type RefPhoto = {
  id: string;
  level: PhotoLevel;
  /** Area id, kit id, or line id (stable across checklist versions). */
  targetId: string;
  url: string;
  status: "approved" | "pending";
  by: string;
};

const P = "/prototype/hash-photos";
const SEED: RefPhoto[] = [
  { id: "p1", level: "area", targetId: "speakers-black-shelf", url: `${P}/room.jpg`, status: "approved", by: "Maya Chen" },
  { id: "p2", level: "kit", targetId: "speakers-shelf", url: `${P}/stands.jpg`, status: "approved", by: "Maya Chen" },
  { id: "p3", level: "item", targetId: "speakers-shelf-2", url: `${P}/speaker.jpg`, status: "approved", by: "Jordan Park" },
  { id: "p4", level: "item", targetId: "speakers-shelf-8", url: `${P}/mixer.jpg`, status: "approved", by: "Jordan Park" },
  { id: "p5", level: "item", targetId: "speakers-shelf-8", url: `${P}/stage.jpg`, status: "approved", by: "Ava Ruiz" },
  { id: "p6", level: "item", targetId: "speakers-shelf-5", url: `${P}/drums.jpg`, status: "pending", by: "You" },
  { id: "p7", level: "kit", targetId: "stands", url: `${P}/stands.jpg`, status: "approved", by: "Maya Chen" },
];

export const LEVEL_LABEL: Record<PhotoLevel, string> = { area: "Area", kit: "Kit", item: "Item" };

/** `areaId:kitId:itemId` → `itemId`. */
export const lineIdOf = (itemKey: string) => itemKey.split(":").at(-1) ?? itemKey;

export type PhotoTarget = { level: PhotoLevel; targetId: string; label: string };
/** What a photo can be added to from a given spot: the item, its kit, its area. */
export type TargetChoices = { item?: PhotoTarget; kit?: PhotoTarget; area: PhotoTarget };

type Ctx = {
  variant: ProtoVariant;
  photosFor: (level: PhotoLevel, targetId: string) => RefPhoto[];
  openViewer: (photos: RefPhoto[], title: string, choices: TargetChoices, start?: number) => void;
  openAdd: (choices: TargetChoices, level: PhotoLevel) => void;
};

const ProtoContext = createContext<Ctx | null>(null);
export const useProto = () => useContext(ProtoContext);

export function useProtoVariant(): ProtoVariant | null {
  const raw = Number(useSearchParams().get("variant"));
  return raw === 1 || raw === 2 || raw === 3 ? raw : null;
}

export function ProtoProvider({ variant, children }: { variant: ProtoVariant; children: React.ReactNode }) {
  const [photos, setPhotos] = useState(SEED);
  const [viewer, setViewer] = useState<{ photos: RefPhoto[]; title: string; choices: TargetChoices; index: number } | null>(null);
  const [adding, setAdding] = useState<{ choices: TargetChoices; level: PhotoLevel } | null>(null);

  const ctx = useMemo<Ctx>(
    () => ({
      variant,
      photosFor: (level, targetId) => photos.filter((photo) => photo.level === level && photo.targetId === targetId),
      openViewer: (list, title, choices, start = 0) => setViewer({ photos: list, title, choices, index: start }),
      openAdd: (choices, level) => setAdding({ choices, level }),
    }),
    [photos, variant],
  );

  return (
    <ProtoContext.Provider value={ctx}>
      {children}
      <PhotoViewer
        state={viewer}
        onClose={() => setViewer(null)}
        onIndex={(index) => setViewer((current) => (current ? { ...current, index } : current))}
        onAdd={() => {
          if (!viewer) return;
          const { choices } = viewer;
          const level = viewer.photos[viewer.index]?.level ?? "item";
          setViewer(null);
          setAdding({ choices, level });
        }}
      />
      <AddPhotoSheet
        state={adding}
        onClose={() => setAdding(null)}
        onSubmit={(target, url) => {
          setPhotos((list) => [
            ...list,
            { id: `new-${list.length}`, level: target.level, targetId: target.targetId, url, status: "pending", by: "You" },
          ]);
          setAdding(null);
          notify.success("Sent for review.");
        }}
      />
      <ProtoPicker variant={variant} />
    </ProtoContext.Provider>
  );
}

export function Thumb({ photo, className, compact }: { photo: RefPhoto; className?: string; compact?: boolean }) {
  return (
    <span className={cn("relative block shrink-0 overflow-hidden bg-muted", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt="" className={cn("size-full object-cover", photo.status === "pending" && "opacity-60")} />
      {photo.status === "pending" && compact ? (
        <span className="absolute right-0.5 bottom-0.5 flex size-4 items-center justify-center bg-background/90" aria-label="In review">
          <ClockIcon className="size-3" aria-hidden />
        </span>
      ) : photo.status === "pending" ? (
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-background/85 py-0.5 text-[10px] font-medium">
          <ClockIcon className="size-3" aria-hidden />
          In review
        </span>
      ) : null}
    </span>
  );
}

function PhotoViewer({
  state,
  onClose,
  onIndex,
  onAdd,
}: {
  state: { photos: RefPhoto[]; title: string; index: number } | null;
  onClose: () => void;
  onIndex: (index: number) => void;
  onAdd: () => void;
}) {
  const photo = state?.photos[state.index];
  const count = state?.photos.length ?? 0;
  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="gap-0 p-0 sm:max-w-2xl" data-testid="proto-photo-viewer">
        <DialogTitle className="px-4 pt-4 pr-12 text-base break-words">{state?.title}</DialogTitle>
        {photo ? (
          <div className="space-y-2 p-4">
            <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt="" className="size-full object-cover" />
              {count > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="Previous photo"
                    className="absolute top-1/2 left-2 flex size-10 -translate-y-1/2 items-center justify-center bg-background/80"
                    onClick={() => onIndex((state!.index - 1 + count) % count)}
                  >
                    <CaretLeftIcon className="size-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next photo"
                    className="absolute top-1/2 right-2 flex size-10 -translate-y-1/2 items-center justify-center bg-background/80"
                    onClick={() => onIndex((state!.index + 1) % count)}
                  >
                    <CaretRightIcon className="size-5" />
                  </button>
                </>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {LEVEL_LABEL[photo.level]} · {photo.status === "pending" ? "In review" : photo.by}
              </span>
              {count > 1 ? (
                <span className="tabular-nums">
                  {state!.index + 1} of {count}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="flex justify-end gap-2 border-t p-3">
          <Button variant="outline" className="h-11" onClick={onAdd} data-testid="proto-viewer-add">
            <CameraIcon aria-hidden />
            Add a photo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddPhotoSheet({
  state,
  onClose,
  onSubmit,
}: {
  state: { choices: TargetChoices; level: PhotoLevel } | null;
  onClose: () => void;
  onSubmit: (target: PhotoTarget, url: string) => void;
}) {
  return (
    <Sheet open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto" data-testid="proto-add-sheet">
        <SheetHeader>
          <SheetTitle>Add a reference photo</SheetTitle>
          <SheetDescription className="sr-only">Take a photo and send it for review.</SheetDescription>
        </SheetHeader>
        {state ? <AddPhotoForm key={JSON.stringify(state)} state={state} onClose={onClose} onSubmit={onSubmit} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function AddPhotoForm({
  state,
  onClose,
  onSubmit,
}: {
  state: { choices: TargetChoices; level: PhotoLevel };
  onClose: () => void;
  onSubmit: (target: PhotoTarget, url: string) => void;
}) {
  const levels = (["item", "kit", "area"] as const).filter((level) => state.choices[level]);
  const [level, setLevel] = useState<PhotoLevel>(levels.includes(state.level) ? state.level : levels[0]);
  const [url, setUrl] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const target = state.choices[level]!;

  return (
    <div className="space-y-4 px-4 pb-6">
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        data-testid="proto-add-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) setUrl(URL.createObjectURL(file));
        }}
      />
      <button
        type="button"
        className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden border border-dashed bg-muted/30 text-muted-foreground"
        onClick={() => input.current?.click()}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm">
            <CameraIcon className="size-8" aria-hidden />
            Take photo
          </span>
        )}
      </button>
      {levels.length > 1 ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium" id="proto-photo-of">
            Photo of
          </p>
          <ToggleGroup
            type="single"
            variant="outline"
            value={level}
            onValueChange={(value) => value && setLevel(value as PhotoLevel)}
            aria-labelledby="proto-photo-of"
            className="w-full [&>button]:h-11 [&>button]:flex-1"
          >
            {levels.map((value) => (
              <ToggleGroupItem key={value} value={value}>
                {LEVEL_LABEL[value]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      ) : null}
      <p className="text-sm break-words text-muted-foreground">{target.label}</p>
      <div className="flex justify-end gap-2">
        {url ? (
          <Button variant="ghost" className="mr-auto h-11" onClick={() => input.current?.click()}>
            Retake
          </Button>
        ) : null}
        <Button variant="outline" className="h-11" onClick={onClose}>
          Cancel
        </Button>
        <Button className="h-11" disabled={!url} data-testid="proto-add-submit" onClick={() => url && onSubmit(target, url)}>
          Send for review
        </Button>
      </div>
    </div>
  );
}

/* ----------------------------- Variant pieces ----------------------------- */

/** Variant 1: a small thumbnail at the end of a row; tap opens the viewer. */
export function RowThumb({ photos, title, choices }: { photos: RefPhoto[]; title: string; choices: TargetChoices }) {
  const proto = useProto()!;
  if (photos.length === 0) return null;
  return (
    <button
      type="button"
      aria-label={`Reference photos for ${title}`}
      className="relative flex w-14 shrink-0 items-center justify-center border-l"
      onClick={() => proto.openViewer(photos, title, choices)}
    >
      <Thumb photo={photos[0]} className="size-10" compact />
      {photos.length > 1 ? (
        <span className="absolute top-1 right-1 bg-foreground px-1 text-[10px] leading-4 font-medium text-background tabular-nums">
          {photos.length}
        </span>
      ) : null}
    </button>
  );
}

/** Variant 3: a horizontal strip of photos with an add tile at the end. */
export function PhotoStrip({
  entries,
  choices,
  addLevel,
  title,
  size = "sm",
}: {
  entries: { photo: RefPhoto; caption?: string }[];
  choices: TargetChoices;
  addLevel: PhotoLevel;
  title: string;
  size?: "sm" | "lg";
}) {
  const proto = useProto()!;
  const box = size === "lg" ? "h-40 w-56" : "h-24 w-32";
  if (entries.length === 0) return null;
  return (
    <div className="flex snap-x gap-2 overflow-x-auto p-2" data-testid="proto-strip">
      {entries.map(({ photo, caption }, index) => (
        <button
          key={photo.id}
          type="button"
          className={cn("shrink-0 snap-start text-left", size === "lg" ? "w-56" : "w-32")}
          onClick={() =>
            proto.openViewer(
              entries.map((entry) => entry.photo),
              title,
              choices,
              index,
            )
          }
        >
          <Thumb photo={photo} className={box} />
          {caption ? <span className="mt-1 line-clamp-2 block text-xs break-words text-muted-foreground">{caption}</span> : null}
        </button>
      ))}
      <button
        type="button"
        className={cn(
          "flex shrink-0 flex-col items-center justify-center gap-1 border border-dashed text-xs text-muted-foreground",
          box,
        )}
        onClick={() => proto.openAdd(choices, addLevel)}
      >
        <PlusIcon className="size-5" aria-hidden />
        Add photo
      </button>
    </div>
  );
}

/** Variant 3: with nothing to show, a camera button in the header adds the first photo. */
export function AddPhotoButton({ choices, level, label }: { choices: TargetChoices; level: PhotoLevel; label: string }) {
  const proto = useProto()!;
  return (
    <button
      type="button"
      aria-label={`Add a photo to ${label}`}
      className="flex w-12 shrink-0 items-center justify-center text-muted-foreground hover:bg-muted/30"
      onClick={() => proto.openAdd(choices, level)}
    >
      <CameraIcon className="size-5" aria-hidden />
    </button>
  );
}

/** Variant 2: everything about one item, photos first, flag as an action. */
export function ItemSheet({
  state,
  onClose,
  onFlag,
  canFlag,
}: {
  state: { title: string; choices: TargetChoices } | null;
  onClose: () => void;
  onFlag: () => void;
  canFlag: boolean;
}) {
  const proto = useProto()!;
  const item = state?.choices.item;
  const kit = state?.choices.kit;
  const area = state?.choices.area;
  const own = item ? proto.photosFor("item", item.targetId) : [];
  const kitPhotos = kit ? proto.photosFor("kit", kit.targetId) : [];
  const areaPhotos = area ? proto.photosFor("area", area.targetId) : [];
  const context = [...kitPhotos, ...areaPhotos];

  return (
    <Sheet open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto" data-testid="proto-item-sheet">
        <SheetHeader>
          <SheetTitle className="break-words">{state?.title}</SheetTitle>
          <SheetDescription className="break-words">
            {[area?.label, kit?.label].filter(Boolean).join(" · ")}
          </SheetDescription>
        </SheetHeader>
        {state ? (
          <div className="space-y-4 px-4 pb-6">
            {own.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {own.map((photo, index) => (
                  <button
                    key={photo.id}
                    type="button"
                    className={cn(own.length === 1 && "col-span-2")}
                    onClick={() => proto.openViewer(own, state.title, state.choices, index)}
                  >
                    <Thumb photo={photo} className="aspect-[4/3] w-full" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="border border-dashed p-4 text-center text-sm text-muted-foreground">No photo of this item yet.</p>
            )}
            {context.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">{kit?.label ?? area?.label}</p>
                <div className="flex gap-2 overflow-x-auto">
                  {context.map((photo, index) => (
                    <button
                      key={photo.id}
                      type="button"
                      onClick={() => proto.openViewer(context, kit?.label ?? area!.label, state.choices, index)}
                    >
                      <Thumb photo={photo} className="h-20 w-28" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="h-12" onClick={() => proto.openAdd(state.choices, "item")}>
                <CameraIcon aria-hidden />
                Add a photo
              </Button>
              <Button variant="outline" className="h-12" disabled={!canFlag} onClick={onFlag}>
                <FlagIcon aria-hidden />
                Flag
              </Button>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function PhotoBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="ml-1.5 inline-flex translate-y-px items-center gap-0.5 align-baseline text-xs text-muted-foreground">
      <ImageIcon className="size-3.5" aria-hidden />
      {count > 1 ? <span className="tabular-nums">{count}</span> : null}
    </span>
  );
}

/* ------------------------------ Picker chrome ------------------------------ */

const PICKER_CSS = `
.proto-picker{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:2147483647;display:flex;align-items:center;gap:2px;padding:4px;border-radius:999px;background:rgba(10,10,10,.82);-webkit-backdrop-filter:blur(12px) saturate(1.4);backdrop-filter:blur(12px) saturate(1.4);box-shadow:0 0 0 1px rgba(255,255,255,.08) inset,0 8px 24px rgba(0,0,0,.24),0 2px 6px rgba(0,0,0,.12);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:13px;line-height:1;-webkit-font-smoothing:antialiased;user-select:none;-webkit-user-select:none}
.proto-picker-highlight{position:absolute;top:4px;left:0;height:28px;border-radius:999px;background:rgba(255,255,255,.12);will-change:transform}
.proto-picker[data-ready] .proto-picker-highlight{transition:transform 250ms cubic-bezier(.23,1,.32,1),width 250ms cubic-bezier(.23,1,.32,1)}
@media (prefers-reduced-motion:reduce){.proto-picker[data-ready] .proto-picker-highlight{transition:none}}
.proto-picker-item{position:relative;display:flex;align-items:center;height:28px;padding:0 12px;border:0;border-radius:999px;background:transparent;color:rgba(255,255,255,.55);font:inherit;cursor:pointer;transition:color 150ms ease-out}
.proto-picker-item:hover{color:rgba(255,255,255,.85)}
.proto-picker-item:active{transform:scale(.97)}
.proto-picker-item:focus-visible{outline:2px solid rgba(255,255,255,.4);outline-offset:2px}
.proto-picker-item[data-active]{color:#fff}
.proto-picker[data-position="top"]{bottom:auto;top:24px}
`;

function ProtoPicker({ variant }: { variant: ProtoVariant }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const nav = useRef<HTMLElement>(null);
  const highlight = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);

  const go = (id: ProtoVariant) => {
    const next = new URLSearchParams(params.toString());
    next.set("variant", String(id));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  useLayoutEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>(`[data-variant="${variant}"]`);
    if (el && highlight.current) {
      highlight.current.style.width = `${el.offsetWidth}px`;
      highlight.current.style.transform = `translateX(${el.offsetLeft}px)`;
    }
  }, [variant]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const num = Number(event.key);
      if (num >= 1 && num <= 3) go(num as ProtoVariant);
      else if (event.key === "ArrowRight") go(((variant % 3) + 1) as ProtoVariant);
      else if (event.key === "ArrowLeft") go((((variant + 1) % 3) + 1) as ProtoVariant);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
    };
  });

  return (
    <>
      <style>{PICKER_CSS}</style>
      <nav ref={nav} className="proto-picker" aria-label="Prototype variants" data-ready={ready ? "" : undefined}>
        <span ref={highlight} className="proto-picker-highlight" aria-hidden="true" />
        {PROTO_VARIANTS.map(({ id, name }) => (
          <button
            key={id}
            type="button"
            className="proto-picker-item"
            data-variant={id}
            data-active={id === variant ? "" : undefined}
            aria-current={id === variant ? "true" : undefined}
            onClick={() => go(id)}
          >
            {name}
          </button>
        ))}
      </nav>
    </>
  );
}

/* ------------------------------ Review queue ------------------------------ */

const QUEUE = [
  {
    id: "q1",
    url: `${P}/drums.jpg`,
    level: "item" as const,
    path: ["Speakers & black shelf", "Shelf", "All monitors are in the middle black shelf, visually in good condition"],
    by: "Sam Rivera",
    when: "Tue, Nov 10",
    existing: 0,
  },
  {
    id: "q2",
    url: `${P}/speaker.jpg`,
    level: "kit" as const,
    path: ["Speakers & black shelf", "Shelf"],
    by: "Priya Nair",
    when: "Tue, Nov 10",
    existing: 1,
  },
  {
    id: "q3",
    url: `${P}/stage.jpg`,
    level: "area" as const,
    path: ["LX Packout"],
    by: "Sam Rivera",
    when: "Tue, Nov 3",
    existing: 0,
  },
];

export function ProtoReviewQueue() {
  const [decided, setDecided] = useState<Record<string, "approved" | "rejected">>({});
  const open = QUEUE.filter((row) => !decided[row.id]);
  if (open.length === 0) return null;
  return (
    <section className="space-y-2 border p-3" data-testid="proto-review-queue">
      <h2 className="flex items-center gap-2 font-medium">
        Photos to review
        <span className="bg-status-amber-500/15 px-1.5 text-xs text-status-amber-700 tabular-nums dark:text-status-amber-200">
          {open.length}
        </span>
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {open.map((row) => (
          <li key={row.id} className="flex min-w-0 flex-col border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={row.url} alt="" className="aspect-[4/3] w-full object-cover" />
            <div className="flex-1 space-y-1 p-3">
              <p className="text-xs font-medium text-muted-foreground uppercase">{LEVEL_LABEL[row.level]}</p>
              <p className="text-sm break-words">{row.path.at(-1)}</p>
              {row.path.length > 1 ? (
                <p className="text-xs break-words text-muted-foreground">{row.path.slice(0, -1).join(" · ")}</p>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {row.by} · {row.when}
                {row.existing > 0 ? ` · ${row.existing} photo already` : ""}
              </p>
            </div>
            <div className="grid grid-cols-2 border-t">
              <button
                type="button"
                className="h-11 border-r text-sm hover:bg-muted/40"
                onClick={() => {
                  setDecided((current) => ({ ...current, [row.id]: "rejected" }));
                  notify.success("Photo rejected.");
                }}
              >
                Reject
              </button>
              <button
                type="button"
                className="h-11 text-sm font-medium hover:bg-muted/40"
                onClick={() => {
                  setDecided((current) => ({ ...current, [row.id]: "approved" }));
                  notify.success("Photo added.");
                }}
              >
                Approve
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
