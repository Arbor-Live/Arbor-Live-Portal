"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ArrowDownIcon, ArrowUpIcon, DotsSixVerticalIcon, DotsThreeIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { api } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { EmptyState, RowFlag } from "@/components/list-page";
import { useAppDialog } from "@/components/ui/app-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SortableList, type SortableRowControls } from "@/components/ui/sortable-list";
import { Textarea } from "@/components/ui/textarea";
import { getConvexErrorMessage } from "@/lib/convex-error";
import {
  addArea,
  addKit,
  areasUsingKit,
  duplicateKit,
  moveKit,
  newChecklistId,
  removeArea,
  removeKitEverywhere,
  removeKitFromArea,
  renameArea,
  renameKit,
  setAreas,
  setExtraItems,
  setFinalChecks,
  setKitItems,
  setPlacements,
  shareKit,
  type ChecklistArea,
  type ChecklistDraft,
  type ChecklistLine,
  type ChecklistPlacement,
} from "@/lib/hashing-checklist-draft";
import { PhotoReviewQueue } from "@/components/hashing/photo-review-queue";
import { SetupPhotoControls, SetupPhotosProvider } from "@/components/hashing/setup-photos";
import { cn } from "@/lib/utils";
import type { SaveStatus } from "@/hooks/use-convex-form";

function MoveButtons({ controls, label }: { controls: SortableRowControls; label: string }) {
  return (
    <div className="flex shrink-0 items-center">
      <span
        {...controls.handleProps}
        className="hidden cursor-grab touch-none px-0.5 text-muted-foreground sm:block"
        aria-hidden
      >
        <DotsSixVerticalIcon className="size-4" />
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={!controls.canMoveUp}
        aria-label={`Move ${label} up`}
        onClick={controls.moveUp}
      >
        <ArrowUpIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        disabled={!controls.canMoveDown}
        aria-label={`Move ${label} down`}
        onClick={controls.moveDown}
      >
        <ArrowDownIcon />
      </Button>
    </div>
  );
}

/** Items in a kit, extras on a placement, or final checks: rows of text with reorder and remove. */
function LineList({
  lines,
  onChange,
  addLabel,
  testId,
}: {
  lines: ChecklistLine[];
  onChange: (lines: ChecklistLine[]) => void;
  addLabel: string;
  testId: string;
}) {
  const [focusId, setFocusId] = useState<string | null>(null);
  return (
    <div className="space-y-1.5" data-testid={testId}>
      <SortableList
        items={lines}
        getId={(line) => line.id}
        onReorder={(ordered) => onChange(ordered)}
        rowClassName="flex items-center gap-1"
        renderItem={(line, _index, controls) => (
          <>
            <MoveButtons controls={controls} label={line.text || "item"} />
            <Textarea
              aria-label="Item"
              autoFocus={line.id === focusId}
              className="min-h-8 min-w-0 flex-1 resize-none py-1.5 field-sizing-content"
              rows={1}
              value={line.text}
              onChange={(event) =>
                onChange(lines.map((row) => (row.id === line.id ? { ...row, text: event.target.value } : row)))
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") event.preventDefault();
              }}
            />
            <SetupPhotoControls level="item" targetId={line.id} label={line.text || "item"} />
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove ${line.text || "item"}`}
              onClick={() => onChange(lines.filter((row) => row.id !== line.id))}
            >
              <XIcon />
            </Button>
          </>
        )}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const id = newChecklistId();
          setFocusId(id);
          onChange([...lines, { id, text: "" }]);
        }}
      >
        <PlusIcon aria-hidden />
        {addLabel}
      </Button>
    </div>
  );
}

function KitBlock({
  draft,
  area,
  placement,
  controls,
  onChange,
}: {
  draft: ChecklistDraft;
  area: ChecklistArea;
  placement: ChecklistPlacement;
  controls: SortableRowControls;
  onChange: (next: ChecklistDraft) => void;
}) {
  const kit = draft.kits.find((candidate) => candidate.id === placement.kitId);
  const nameRef = useRef<HTMLInputElement>(null);
  const { confirm } = useAppDialog();
  const [removing, setRemoving] = useState(false);
  if (!kit) return null;

  const usedIn = areasUsingKit(draft, kit.id);
  const shared = usedIn.length > 1;
  const elsewhere = draft.areas.filter((candidate) => !usedIn.some((used) => used.id === candidate.id));

  async function remove() {
    if (shared) {
      setRemoving(true);
      return;
    }
    const ok = await confirm({
      title: `Remove ${kit!.name || "this kit"}?`,
      description: "It leaves the draft. Published hashes keep their own copy.",
      destructive: true,
      confirmLabel: "Remove kit",
    });
    if (ok) onChange(removeKitFromArea(draft, area.id, kit!.id));
  }

  return (
    <section className="min-w-0 border" data-testid="hash-kit" data-kit={kit.id}>
      <div className="flex items-center gap-1 bg-muted/20 p-1.5">
        <MoveButtons controls={controls} label={kit.name || "kit"} />
        <Input
          ref={nameRef}
          aria-label="Kit name"
          className="h-8 min-w-0 flex-1 font-medium"
          value={kit.name}
          onChange={(event) => onChange(renameKit(draft, kit.id, event.target.value))}
        />
        {shared ? (
          <RowFlag tone="neutral" className="hidden sm:inline">
            Shared
          </RowFlag>
        ) : null}
        <SetupPhotoControls level="kit" targetId={kit.id} label={kit.name || "kit"} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${kit.name || "kit"}`}>
              <DotsThreeIcon weight="bold" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={() => window.setTimeout(() => nameRef.current?.focus(), 0)}>
              Rename
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={elsewhere.length === 0}>Move to another area</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                {elsewhere.map((target) => (
                  <DropdownMenuItem key={target.id} onSelect={() => onChange(moveKit(draft, kit.id, area.id, target.id))}>
                    {target.name || "Untitled area"}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={() => onChange(duplicateKit(draft, area.id, kit.id))}>Duplicate</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={elsewhere.length === 0}>Share with another area</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52">
                {elsewhere.map((target) => (
                  <DropdownMenuItem key={target.id} onSelect={() => onChange(shareKit(draft, kit.id, target.id))}>
                    {target.name || "Untitled area"}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
              Remove
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="space-y-2 p-1.5">
        <LineList
          lines={kit.items}
          onChange={(items) => onChange(setKitItems(draft, kit.id, items))}
          addLabel="Add item"
          testId="hash-kit-items"
        />
        {shared || placement.extraItems.length > 0 ? (
          <div className="space-y-1 border-t pt-2">
            <p className="px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Only here</p>
            <LineList
              lines={placement.extraItems}
              onChange={(items) => onChange(setExtraItems(draft, area.id, kit.id, items))}
              addLabel="Add item only here"
              testId="hash-kit-extras"
            />
          </div>
        ) : null}
      </div>

      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent data-testid="hash-remove-kit-dialog">
          <DialogHeader>
            <DialogTitle className="break-words">Remove {kit.name}?</DialogTitle>
            <DialogDescription>
              It&apos;s also in {usedIn.filter((used) => used.id !== area.id).map((used) => used.name).join(", ")}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setRemoving(false);
                onChange(removeKitFromArea(draft, area.id, kit.id));
              }}
            >
              From this area
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setRemoving(false);
                onChange(removeKitEverywhere(draft, kit.id));
              }}
            >
              Everywhere
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function AreaEditor({
  draft,
  area,
  onChange,
}: {
  draft: ChecklistDraft;
  area: ChecklistArea;
  onChange: (next: ChecklistDraft) => void;
}) {
  const { confirm } = useAppDialog();

  async function remove() {
    const ok = await confirm({
      title: `Remove ${area.name || "this area"}?`,
      description: "It leaves the draft, with any kit only it uses. Started hashes keep their own copy.",
      destructive: true,
      confirmLabel: "Remove area",
    });
    if (ok) onChange(removeArea(draft, area.id));
  }

  return (
    <div className="min-w-0 space-y-3" data-testid="hash-area-editor">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Area name"
          className="min-w-0 flex-1 font-semibold"
          value={area.name}
          onChange={(event) => onChange(renameArea(draft, area.id, event.target.value))}
        />
        <SetupPhotoControls level="area" targetId={area.id} label={area.name || "area"} />
        <Button type="button" variant="outline" size="sm" onClick={() => void remove()}>
          Remove area
        </Button>
      </div>

      <SortableList
        items={area.placements}
        getId={(placement) => placement.kitId}
        onReorder={(ordered) => onChange(setPlacements(draft, area.id, ordered))}
        rowClassName="mb-3"
        renderItem={(placement, _index, controls) => (
          <KitBlock draft={draft} area={area} placement={placement} controls={controls} onChange={onChange} />
        )}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="hash-add-kit"
        onClick={() => onChange(addKit(draft, area.id, { id: newChecklistId(), name: "New kit" }))}
      >
        <PlusIcon aria-hidden />
        Add kit
      </Button>

      <section className="space-y-1.5 border p-1.5" data-testid="hash-final-checks">
        <h3 className="px-1 pt-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Final checks</h3>
        <LineList
          lines={area.finalChecks}
          onChange={(lines) => onChange(setFinalChecks(draft, area.id, lines))}
          addLabel="Add final check"
          testId="hash-final-lines"
        />
      </section>
    </div>
  );
}

export function ChecklistTab() {
  const current = useQuery(api.hashingChecklist.getCurrent, {});
  const publish = useMutation(api.hashingChecklist.publish);
  const [edits, setEdits] = useState<{ baseVersion: number; tree: ChecklistDraft } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  if (current === undefined) return <Skeleton className="h-96 w-full" />;

  const draft: ChecklistDraft = edits?.tree ?? current.tree;
  const baseVersion = edits?.baseVersion ?? current.version;
  const dirty = edits !== null;
  const area = draft.areas.find((candidate) => candidate.id === selected) ?? draft.areas[0];

  function change(tree: ChecklistDraft) {
    setEdits({ baseVersion, tree });
    setStatus("idle");
  }

  async function save() {
    setStatus("saving");
    setError(null);
    try {
      await publish({ baseVersion, ...draft });
      setEdits(null);
      setStatus("saved");
    } catch (saveError) {
      setError(getConvexErrorMessage(saveError, "Couldn't publish the checklist."));
      setStatus("error");
    }
  }

  function renderArea(row: ChecklistArea, controls: SortableRowControls) {
    const active = row.id === area?.id;
    return (
      <div className={cn("flex items-center gap-1 border pr-1", active && "border-primary bg-primary/5")}>
        <MoveButtons controls={controls} label={row.name || "area"} />
        <button
          type="button"
          className="min-w-0 flex-1 py-2 text-left text-sm font-medium break-words"
          aria-current={active ? "true" : undefined}
          data-testid="hash-area-tab"
          onClick={() => setSelected(row.id)}
        >
          {row.name || "Untitled area"}
        </button>
      </div>
    );
  }

  return (
    <SetupPhotosProvider published={current.tree}>
      <div className="space-y-4" data-testid="hash-checklist">
        <PhotoReviewQueue />
        <p className="text-sm text-muted-foreground" data-testid="hash-checklist-version">
          Version {current.version}. A published change applies to the next hash started.
        </p>
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-2">
            <SortableList
              items={draft.areas}
              getId={(row) => row.id}
              onReorder={(ordered) => change(setAreas(draft, ordered))}
              rowClassName="mb-1.5"
              renderItem={(row, _index, controls) => renderArea(row, controls)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="hash-add-area"
              onClick={() => {
                const id = newChecklistId();
                change(addArea(draft, { id, name: "New area" }));
                setSelected(id);
              }}
            >
              <PlusIcon aria-hidden />
              Add area
            </Button>
          </aside>
          {area ? <AreaEditor key={area.id} draft={draft} area={area} onChange={change} /> : <EmptyState>Add an area to start.</EmptyState>}
        </div>
        <FormSaveBar
          tier="C"
          saveStatus={status}
          saveError={error}
          isDirty={dirty}
          saveLabel="Publish"
          onSave={() => void save()}
          onDiscard={() => {
            setEdits(null);
            setStatus("idle");
            setError(null);
          }}
          onRetry={() => void save()}
        />
      </div>
    </SetupPhotosProvider>
  );
}
