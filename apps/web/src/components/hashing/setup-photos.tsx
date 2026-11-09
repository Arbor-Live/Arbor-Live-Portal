"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { CameraIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { PhotoThumbButton, SetupReferencePhotosProvider, type PhotoLevel } from "@/components/hashing/live/reference-photos";
import { useR2FileUpload } from "@/hooks/use-r2-file-upload";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";

type Tree = {
  kits: { id: string; items: { id: string }[] }[];
  areas: { id: string; placements: { extraItems: { id: string }[] }[]; finalChecks: { id: string }[] }[];
};

type Context = { published: Set<string>; busy: boolean; pick: (level: PhotoLevel, targetId: string) => void };

const SetupPhotosContext = createContext<Context | null>(null);

const UPLOAD = { scope: "hashing" } as const;
const keyOf = (level: PhotoLevel, targetId: string) => `${level}:${targetId}`;

/** What the server will accept a photo for: only ids in the published version. */
function publishedTargets(tree: Tree) {
  const keys = new Set<string>();
  for (const kit of tree.kits) {
    keys.add(keyOf("kit", kit.id));
    for (const line of kit.items) keys.add(keyOf("item", line.id));
  }
  for (const area of tree.areas) {
    keys.add(keyOf("area", area.id));
    for (const line of area.finalChecks) keys.add(keyOf("item", line.id));
    for (const placement of area.placements) for (const line of placement.extraItems) keys.add(keyOf("item", line.id));
  }
  return keys;
}

export function SetupPhotosProvider({ published, children }: { published: Tree; children: React.ReactNode }) {
  const addPhoto = useMutation(api.hashingPhotos.addFromSetup);
  const { uploadFile } = useR2FileUpload(UPLOAD);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const target = useRef<{ level: PhotoLevel; targetId: string } | null>(null);
  const keys = useMemo(() => publishedTargets(published), [published]);

  async function upload(file: File, to: { level: PhotoLevel; targetId: string }) {
    setBusy(true);
    try {
      const photo = await uploadFile(file);
      if (!photo) {
        notify.error("Couldn't upload that photo.");
        return;
      }
      await addPhoto({ ...to, photo });
      notify.success("Photo added.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn't add that photo."));
    } finally {
      setBusy(false);
    }
  }

  const context = useMemo<Context>(
    () => ({
      published: keys,
      busy,
      pick: (level, targetId) => {
        target.current = { level, targetId };
        input.current?.click();
      },
    }),
    [keys, busy],
  );

  return (
    <SetupPhotosContext.Provider value={context}>
      <SetupReferencePhotosProvider>
        {children}
        <input
          ref={input}
          type="file"
          accept="image/*"
          className="sr-only"
          tabIndex={-1}
          data-testid="hash-setup-photo-input"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file && target.current) void upload(file, target.current);
          }}
        />
      </SetupReferencePhotosProvider>
    </SetupPhotosContext.Provider>
  );
}

/** Approved thumbnail plus a camera button, for an area header, a kit header or an item row. */
export function SetupPhotoControls({ level, targetId, label }: { level: PhotoLevel; targetId: string; label: string }) {
  const context = useContext(SetupPhotosContext);
  if (!context) throw new Error("SetupPhotoControls must be used within SetupPhotosProvider");
  return (
    <>
      <PhotoThumbButton level={level} targetId={targetId} title={label} thumbClassName="size-8" />
      {context.published.has(keyOf(level, targetId)) ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          disabled={context.busy}
          aria-label={`Add a photo to ${label}`}
          onClick={() => context.pick(level, targetId)}
        >
          <CameraIcon />
        </Button>
      ) : null}
    </>
  );
}
