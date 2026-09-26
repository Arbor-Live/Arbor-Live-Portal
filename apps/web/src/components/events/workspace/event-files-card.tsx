"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import {
  ClipboardTextIcon,
  FileTextIcon,
  ListChecksIcon,
  NoteIcon,
  PaperclipIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
  type Icon,
} from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EventArtifactUploadField } from "@/components/files/file-upload-field";
import { StoredAssetImage, StoredAssetLink } from "@/components/files/stored-asset-image";
import { useAppDialog } from "@/components/ui/app-dialog";
import { isImageAssetReference } from "@/lib/r2-assets";
import { getConvexErrorMessage } from "@/lib/convex-error";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import type { EventDetail } from "@/components/events/workspace/event-draft";

type ArtifactType = "note" | "instruction" | "document" | "pull_list";
type Artifact = EventDetail["artifacts"][number];

const ARTIFACT_TYPES: Record<ArtifactType, { label: string; icon: Icon }> = {
  note: { label: "Note", icon: NoteIcon },
  instruction: { label: "Instructions", icon: ClipboardTextIcon },
  document: { label: "Document", icon: FileTextIcon },
  pull_list: { label: "Pull list", icon: ListChecksIcon },
};

/** Pull-list artifacts predate the Equipment tab; show old ones but don't create new ones. */
const CREATABLE_TYPES: ArtifactType[] = ["note", "instruction", "document"];

function ArtifactAttachment({ artifact }: { artifact: Artifact }) {
  const storedValue = artifact.linkUrl ?? artifact.fileUrl;
  if (!storedValue?.trim()) return null;
  if (isImageAssetReference(storedValue)) {
    return <StoredAssetImage storedValue={storedValue} className="max-h-40 border object-contain" />;
  }
  return (
    <StoredAssetLink
      storedValue={storedValue}
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
    >
      <PaperclipIcon className="size-3.5" />
      View attachment
    </StoredAssetLink>
  );
}

function AddFileForm({ eventId, onDone }: { eventId: Id<"events">; onDone: () => void }) {
  const createArtifact = useMutation(api.eventArtifacts.create);
  const [type, setType] = useState<ArtifactType>("note");
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      await createArtifact({
        eventId,
        artifactType: type,
        title,
        markdown: markdown || undefined,
        linkUrl: linkUrl.trim() || undefined,
      });
      notify.success("File added.");
      onDone();
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn’t add the file."));
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 border bg-muted/20 p-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="File type">
        {CREATABLE_TYPES.map((value) => {
          const { label, icon: TypeIcon } = ARTIFACT_TYPES[value];
          const selected = value === type;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setType(value)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 border px-2.5 text-sm",
                selected
                  ? "border-primary bg-primary/10"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <TypeIcon className="size-3.5" />
              {label}
            </button>
          );
        })}
      </div>
      <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea
        className="min-h-20 w-full border bg-background px-3 py-2 text-sm"
        placeholder="Details (optional)"
        value={markdown}
        onChange={(e) => setMarkdown(e.target.value)}
      />
      <EventArtifactUploadField
        eventId={eventId}
        urlValue={linkUrl}
        onUploaded={setLinkUrl}
        onUrlChange={setLinkUrl}
        onClear={() => setLinkUrl("")}
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={!title.trim() || saving} onClick={() => void submit()}>
          {saving ? "Adding…" : "Add file"}
        </Button>
      </div>
    </div>
  );
}

export function EventFilesCard({
  eventId,
  artifacts,
  canEdit,
}: {
  eventId: Id<"events">;
  artifacts: Artifact[];
  canEdit: boolean;
}) {
  const { confirm } = useAppDialog();
  const removeArtifact = useMutation(api.eventArtifacts.remove);
  const [adding, setAdding] = useState(false);

  async function remove(artifact: Artifact) {
    const ok = await confirm({
      title: `Delete “${artifact.title}”?`,
      description: "This removes the file and its attachment from the event.",
      destructive: true,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await removeArtifact({ id: artifact._id });
      notify.success("File deleted.");
    } catch (error) {
      notify.error(getConvexErrorMessage(error, "Couldn’t delete the file."));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <PaperclipIcon className="size-4 text-muted-foreground" />
          Files &amp; notes
          {artifacts.length > 0 ? (
            <span className="text-xs font-normal text-muted-foreground">{artifacts.length}</span>
          ) : null}
        </CardTitle>
        {canEdit ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding((prev) => !prev)}>
            {adding ? <XIcon /> : <PlusIcon />}
            {adding ? "Close" : "Add"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding ? <AddFileForm eventId={eventId} onDone={() => setAdding(false)} /> : null}
        {artifacts.length === 0 && !adding ? (
          <p className="text-sm text-muted-foreground">
            No files yet. Add run-of-show notes, load-in instructions, or documents the crew should see.
          </p>
        ) : null}
        {artifacts.length > 0 ? (
          <ul className="divide-y border">
            {artifacts.map((artifact) => {
              const meta = ARTIFACT_TYPES[artifact.artifactType as ArtifactType] ?? ARTIFACT_TYPES.note;
              const TypeIcon = meta.icon;
              return (
                <li key={artifact._id} className="flex gap-3 px-3 py-2.5">
                  <TypeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-baseline gap-2">
                      <p className="truncate text-sm font-medium">{artifact.title}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">{meta.label}</span>
                    </div>
                    {artifact.markdown ? (
                      <p className="whitespace-pre-wrap text-xs text-muted-foreground">{artifact.markdown}</p>
                    ) : null}
                    <ArtifactAttachment artifact={artifact} />
                  </div>
                  {canEdit ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Delete ${artifact.title}`}
                      onClick={() => void remove(artifact)}
                    >
                      <TrashIcon />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
