"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { MicrophoneStageIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { api, type Id } from "@/lib/convex-api";
import { FormSaveBar } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SearchableSelect } from "@/components/inventory/searchable-select";
import { useConvexForm } from "@/hooks/use-convex-form";
import { useAppDialog } from "@/components/ui/app-dialog";
import { notify } from "@/lib/notify";
import { GroupApplyScopeFields } from "@/components/events/group-apply-scope-fields";
import {
  formatOccurrencePreview,
  groupDayLabel,
  groupDayNoun,
  type EventGroupKind,
} from "@/lib/event-series";
import {
  formatPositionDraftWindows,
  positionDraftsToTemplates,
  positionTemplatesToDrafts,
  POSITION_TYPE_LABELS,
  POSITION_TYPE_OPTIONS,
  type SeriesPositionTemplate,
  type SeriesPositionTemplateDraft,
} from "@/lib/event-series-positions";
import {
  seriesPositionEditorSchema,
  type SeriesPositionEditorFormValues,
} from "@/lib/validations/event";

type EventSeriesPositionEditorProps = {
  seriesId: Id<"eventSeries">;
  kind?: EventGroupKind;
  positionTemplates?: SeriesPositionTemplate[];
  occurrences: Array<{ _id: Id<"events">; occurrenceIndex?: number; startAt: number }>;
  onMessage: (message: string) => void;
  /** Reports unsaved edits (the group page marks the tab). */
  onDirtyChange?: (dirty: boolean) => void;
};

function emptyDraft(clientId: string): SeriesPositionTemplateDraft {
  return {
    clientId,
    templateKey: "",
    label: "",
    artistType: "band",
    genres: "",
    setOffsetHours: "",
    setDurationMinutes: "",
    soundcheckOffsetHours: "",
    soundcheckDurationMinutes: "",
  };
}

/**
 * The shape of the bill across a series: positions (label, type, genres and
 * relative windows) applied to each occurrence. Open positions are added, moved
 * and removed; filled positions are never touched.
 */
export function EventSeriesPositionEditor({
  onDirtyChange,
  seriesId,
  kind = "recurring",
  positionTemplates,
  occurrences,
  onMessage,
}: EventSeriesPositionEditorProps) {
  const applyPositions = useMutation(api.eventSeries.regenerateFuturePositions);
  const importPositions = useMutation(api.eventSeries.importPositionsFromOccurrence);
  const localCounterRef = useRef(0);
  const [draftsOverride, setDraftsOverride] = useState<SeriesPositionTemplateDraft[] | null>(null);
  const [draftsDirty, setDraftsDirty] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const form = useConvexForm<SeriesPositionEditorFormValues>({
    schema: seriesPositionEditorSchema,
    defaultValues: { applyScope: "all", fromOccurrenceIndex: "0", importOccurrenceId: "" },
    mode: "onChange",
  });

  // Keyed on content, not identity: `eventSeries.get` re-runs whenever any
  // occurrence changes and hands back a new array, which must not wipe drafts.
  const templatesSignature = JSON.stringify(positionTemplates ?? []);
  const initialDrafts = useMemo(
    () => positionTemplatesToDrafts(JSON.parse(templatesSignature) as SeriesPositionTemplate[]),
    [templatesSignature],
  );

  // Reset local edits whenever the saved template changes (same pattern as the
  // crew shift editor), computed during render rather than in an effect.
  const [syncedDrafts, setSyncedDrafts] = useState(initialDrafts);
  if (initialDrafts !== syncedDrafts) {
    setSyncedDrafts(initialDrafts);
    setDraftsOverride(null);
    setDraftsDirty(false);
    setSelectedClientId(null);
  }
  const drafts = draftsOverride ?? initialDrafts;

  useEffect(() => {
    if (form.formState.isDirty) return;
    form.reset({ applyScope: "all", fromOccurrenceIndex: "0", importOccurrenceId: "" });
  }, [initialDrafts, form]);

  const occurrenceOptions = useMemo(
    () =>
      occurrences.map((row) => ({
        value: row._id,
        label: `${groupDayLabel(kind, row.occurrenceIndex)} · ${formatOccurrencePreview(row.startAt)}`,
      })),
    [kind, occurrences],
  );

  const selectedDraft = drafts.find((draft) => draft.clientId === selectedClientId) ?? null;
  const positionCount = drafts.length;
  const isDirty = form.formState.isDirty || draftsDirty;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  function updateDraft(clientId: string, patch: Partial<SeriesPositionTemplateDraft>) {
    setDraftsDirty(true);
    setDraftsOverride(drafts.map((row) => (row.clientId === clientId ? { ...row, ...patch } : row)));
  }

  function removeDraft(clientId: string) {
    setDraftsDirty(true);
    setDraftsOverride(drafts.filter((row) => row.clientId !== clientId));
    setSelectedClientId((current) => (current === clientId ? null : current));
  }

  function addDraft() {
    const clientId = `local-position-${(localCounterRef.current += 1)}`;
    setDraftsOverride([...drafts, emptyDraft(clientId)]);
    setDraftsDirty(true);
    setSelectedClientId(clientId);
  }

  async function applyTemplate(values: SeriesPositionEditorFormValues) {
    const templates = positionDraftsToTemplates(drafts);
    if (templates.some((template) => !template.label)) {
      throw new Error("Give every position a name before applying.");
    }
    const parsedFromIndex = Number(values.fromOccurrenceIndex);
    if (!Number.isInteger(parsedFromIndex) || parsedFromIndex < 0) {
      throw new Error(`Pick a ${groupDayNoun(kind)} to apply from.`);
    }
    const result = await applyPositions({
      id: seriesId,
      scope: values.applyScope,
      fromOccurrenceIndex: parsedFromIndex,
      positionTemplates: templates,
    });
    onMessage(
      `Saved position template and applied it to ${result.updatedCount} ${groupDayNoun(kind, result.updatedCount !== 1)}. Filled positions were kept.`,
    );
    setDraftsDirty(false);
    form.reset(values);
  }

  const onSaveTemplate = form.submitMutation(applyTemplate);

  async function handleImportFromOccurrence() {
    const importOccurrenceId = form.getValues("importOccurrenceId");
    if (!importOccurrenceId) {
      notify.error(`Select a ${groupDayNoun(kind)} to import from.`);
      return;
    }
    await form.runMutation(async () => {
      const result = await importPositions({
        id: seriesId,
        eventId: importOccurrenceId as Id<"events">,
      });
      onMessage(
        `Imported ${result.templateCount} position${result.templateCount === 1 ? "" : "s"} into the ${kind === "multi_day" ? "booking" : "series"} template.`,
      );
    });
  }

  function handleDiscard() {
    setDraftsOverride(null);
    setDraftsDirty(false);
    setSelectedClientId(null);
    form.reset({ applyScope: "all", fromOccurrenceIndex: "0", importOccurrenceId: "" });
  }

  return (
    <>
      <Card data-testid="series-position-editor">
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <MicrophoneStageIcon className="size-4 text-muted-foreground" aria-hidden />
              {kind === "multi_day" ? "Booking positions" : "Series positions"}
            </CardTitle>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={addDraft}>
            <PlusIcon aria-hidden />
            Add position
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground" data-testid="series-position-summary">
            {positionCount === 0
              ? "No positions in the template"
              : `${positionCount} position${positionCount === 1 ? "" : "s"} in the template`}
            {" · "}applied to each {groupDayNoun(kind)} in scope
          </p>

          {drafts.length === 0 ? (
            <div className="border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              No positions yet. Add a position, or import them from a {groupDayNoun(kind)}.
            </div>
          ) : (
            <ul className="space-y-0 border" data-testid="series-position-list">
              {drafts.map((draft, index) => {
                const windows = formatPositionDraftWindows(draft);
                return (
                  <li key={draft.clientId} className="flex items-center gap-2 border-b text-sm last:border-b-0">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left hover:bg-muted/30"
                      onClick={() => setSelectedClientId(draft.clientId)}
                    >
                      <span className="w-6 text-right tabular-nums text-muted-foreground">{index + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium truncate">
                          {draft.label.trim() || "Unnamed position"}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {POSITION_TYPE_LABELS[draft.artistType]}
                          {windows ? ` · ${windows}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label>Import positions from {groupDayNoun(kind)}</Label>
              <SearchableSelect
                value={form.watch("importOccurrenceId")}
                onChange={(value) =>
                  form.setValue("importOccurrenceId", value, { shouldDirty: true })
                }
                options={occurrenceOptions}
                placeholder={`Select ${groupDayNoun(kind)}...`}
                emptyLabel={`Select ${groupDayNoun(kind)}`}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                disabled={form.saveStatus === "saving"}
                onClick={() => void handleImportFromOccurrence()}
              >
                Import into template
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <GroupApplyScopeFields
                idPrefix="series-positions"
                kind={kind}
                days={occurrences}
                scope={form.watch("applyScope")}
                dayIndex={form.watch("fromOccurrenceIndex")}
                onScopeChange={(value) => form.setValue("applyScope", value, { shouldDirty: true })}
                onDayIndexChange={(value) =>
                  form.setValue("fromOccurrenceIndex", value, { shouldDirty: true })
                }
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                disabled={form.saveStatus === "saving"}
                onClick={() => void form.handleSubmit(onSaveTemplate)()}
              >
                Save template &amp; apply positions
              </Button>
            </div>
          </div>
          {form.saveError ? <p className="text-sm text-destructive">{form.saveError}</p> : null}
        </CardContent>
      </Card>

      <PositionTemplateSheet
        kind={kind}
        draft={selectedDraft}
        onOpenChange={(open) => {
          if (!open) setSelectedClientId(null);
        }}
        onChange={updateDraft}
        onRemove={(clientId) => removeDraft(clientId)}
      />

      <FormSaveBar
        tier="C"
        saveStatus={form.saveStatus}
        saveError={form.saveError}
        isDirty={isDirty}
        saveLabel="Save template & apply positions"
        onSave={() => void form.handleSubmit(onSaveTemplate)()}
        onDiscard={handleDiscard}
        onRetry={() => void form.handleSubmit(onSaveTemplate)()}
      />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 border-t px-4 py-4">
      <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function PositionTemplateSheet({
  kind,
  draft,
  onOpenChange,
  onChange,
  onRemove,
}: {
  kind: EventGroupKind;
  draft: SeriesPositionTemplateDraft | null;
  onOpenChange: (open: boolean) => void;
  onChange: (clientId: string, patch: Partial<SeriesPositionTemplateDraft>) => void;
  onRemove: (clientId: string) => void;
}) {
  return (
    <Sheet open={draft !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-testid="position-template-sheet">
        {draft ? (
          <PositionTemplateBody
            key={draft.clientId}
            kind={kind}
            draft={draft}
            onChange={onChange}
            onRemove={onRemove}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function PositionTemplateBody({
  kind,
  draft,
  onChange,
  onRemove,
  onClose,
}: {
  kind: EventGroupKind;
  draft: SeriesPositionTemplateDraft;
  onChange: (clientId: string, patch: Partial<SeriesPositionTemplateDraft>) => void;
  onRemove: (clientId: string) => void;
  onClose: () => void;
}) {
  const { confirm } = useAppDialog();
  const id = draft.clientId;

  async function handleRemove() {
    const shouldRemove = await confirm({
      title: `Remove ${draft.label.trim() || "this position"} from the template?`,
      description: "Applying the template will remove the open position from occurrences in scope.",
      confirmLabel: "Remove position",
      destructive: true,
    });
    if (!shouldRemove) return;
    onRemove(id);
    onClose();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{draft.label.trim() || "New position"}</SheetTitle>
        <SheetDescription className="sr-only">Position template</SheetDescription>
      </SheetHeader>

      <Section title="Position">
        <div className="space-y-1">
          <Label htmlFor="position-template-name">Name</Label>
          <Input
            id="position-template-name"
            value={draft.label}
            placeholder="e.g. Headliner, Opener"
            onChange={(event) => onChange(id, { label: event.target.value })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Looking for</Label>
            <SearchableSelect
              value={draft.artistType}
              onChange={(value) =>
                onChange(id, { artistType: value as SeriesPositionTemplateDraft["artistType"] })
              }
              options={POSITION_TYPE_OPTIONS}
              placeholder="Select type"
              emptyLabel="Select type"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="position-template-genres">Genres / vibes</Label>
            <Input
              id="position-template-genres"
              value={draft.genres}
              placeholder="e.g. indie, jazz, house"
              onChange={(event) => onChange(id, { genres: event.target.value })}
            />
          </div>
        </div>
      </Section>

      <Section title="Set">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="position-template-set-offset">Starts (hours after start)</Label>
            <Input
              id="position-template-set-offset"
              type="number"
              step="0.25"
              value={draft.setOffsetHours}
              placeholder="e.g. 2"
              onChange={(event) => onChange(id, { setOffsetHours: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="position-template-set-duration">Duration (minutes)</Label>
            <Input
              id="position-template-set-duration"
              type="number"
              step="5"
              value={draft.setDurationMinutes}
              placeholder="60"
              onChange={(event) => onChange(id, { setDurationMinutes: event.target.value })}
            />
          </div>
        </div>
      </Section>

      <Section title="Soundcheck">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="position-template-soundcheck-offset">Starts (hours after start)</Label>
            <Input
              id="position-template-soundcheck-offset"
              type="number"
              step="0.25"
              value={draft.soundcheckOffsetHours}
              placeholder="e.g. -1"
              onChange={(event) => onChange(id, { soundcheckOffsetHours: event.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="position-template-soundcheck-duration">Duration (minutes)</Label>
            <Input
              id="position-template-soundcheck-duration"
              type="number"
              step="5"
              value={draft.soundcheckDurationMinutes}
              placeholder="30"
              onChange={(event) => onChange(id, { soundcheckDurationMinutes: event.target.value })}
            />
          </div>
        </div>
      </Section>

      <SheetFooter className="flex-row justify-between gap-2 border-t">
        <Button type="button" variant="destructive" size="sm" onClick={() => void handleRemove()}>
          <TrashIcon aria-hidden />
          Remove position
        </Button>
        <Button type="button" size="sm" onClick={onClose}>
          Done
        </Button>
      </SheetFooter>
    </>
  );
}
