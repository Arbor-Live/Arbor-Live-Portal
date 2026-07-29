"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowLeftIcon,
  CaretDownIcon,
  CaretUpIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import {
  blankBacklineItem,
  blankInput,
  blankMix,
  INPUT_TYPE_LABELS,
  MONITOR_TYPE_LABELS,
  MONITOR_TYPE_OPTIONS,
  moveInArray,
  placeSymbol,
  PROVIDED_BY_EDITOR_LABELS,
  removeItem,
  renumberInputs,
  renumberMixes,
  riderWarnings,
  STAGE_PRESETS,
  STAND_LABELS,
  snapStageFt,
  stageSizeOptions,
  updateItem,
  type RiderBacklineItem,
  type RiderContent,
  type RiderInputChannel,
  type RiderInputType,
  type RiderMonitorMix,
  type RiderMonitorType,
  type RiderProvidedBy,
  type RiderStandType,
} from "@arbor/rider-document";
import { api, type Id } from "@/lib/convex-api";
import { getConvexErrorMessage } from "@/lib/convex-error";
import type { SaveStatus } from "@/hooks/use-convex-form";
import { FormSaveBar } from "@/components/forms";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RiderPdfDownloadButton } from "@/components/riders/rider-pdf-download-button";
import { RiderSymbolPalette } from "@/components/riders/rider-symbol-palette";
import { StagePlotCanvas } from "@/components/riders/stage-plot-canvas";
import { cn } from "@/lib/utils";

type Draft = {
  name: string;
  status: "draft" | "published";
  content: RiderContent;
};

function contentFromRider(rider: {
  stage: RiderContent["stage"];
  items: RiderContent["items"];
  inputs: RiderContent["inputs"];
  monitorMixes: RiderContent["monitorMixes"];
  backline: RiderContent["backline"];
  performerCount?: number;
  setLengthMinutes?: number;
  powerNotes?: string;
  generalNotes?: string;
  hospitalityNotes?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}): RiderContent {
  return {
    stage: rider.stage,
    items: rider.items,
    inputs: rider.inputs,
    monitorMixes: rider.monitorMixes,
    backline: rider.backline,
    performerCount: rider.performerCount,
    setLengthMinutes: rider.setLengthMinutes,
    powerNotes: rider.powerNotes,
    generalNotes: rider.generalNotes,
    hospitalityNotes: rider.hospitalityNotes,
    contactName: rider.contactName,
    contactEmail: rider.contactEmail,
    contactPhone: rider.contactPhone,
  };
}

function draftKey(draft: Draft): string {
  return JSON.stringify(draft);
}

const INPUT_TYPES = Object.keys(INPUT_TYPE_LABELS) as RiderInputType[];
const STAND_TYPES = Object.keys(STAND_LABELS) as RiderStandType[];
const PROVIDED_BY = Object.keys(PROVIDED_BY_EDITOR_LABELS) as RiderProvidedBy[];
const MONITOR_TYPES = MONITOR_TYPE_OPTIONS;

const fieldClass =
  "h-8 w-full min-w-0 rounded-none border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:opacity-50";

export function RiderEditorClient({ riderId }: { riderId: Id<"bandRiders"> }) {
  const rider = useQuery(api.bandRiders.get, { riderId });
  const updateRider = useMutation(api.bandRiders.update);
  const setDefault = useMutation(api.bandRiders.setDefault);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const savedFadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!rider) return;
    if (hydratedId === rider._id && draft !== null) return;
    const next: Draft = {
      name: rider.name,
      status: rider.status,
      content: contentFromRider(rider),
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydrate per rider id
    setDraft(next);
    setBaseline(draftKey(next));
    setHydratedId(rider._id);
    setSelectedId(null);
  }, [rider, hydratedId, draft]);

  const isDirty = draft !== null && baseline !== null && draftKey(draft) !== baseline;
  const readOnly = rider?.canEdit === false;
  const warnings = useMemo(
    () => (draft ? riderWarnings(draft.content) : []),
    [draft],
  );

  function patchContent(updater: (content: RiderContent) => RiderContent) {
    setDraft((current) =>
      current ? { ...current, content: updater(current.content) } : current,
    );
  }

  function placeAt(symbolKey: string, xFt: number, yFt: number) {
    let itemId: string | null = null;
    setDraft((current) => {
      if (!current) return current;
      const result = placeSymbol(current.content, { symbolKey, xFt, yFt });
      itemId = result.itemId;
      return { ...current, content: result.content };
    });
    if (itemId) setSelectedId(itemId);
  }

  async function persist(overrides?: Partial<Draft>) {
    if (!draft || readOnly) return;
    const next: Draft = {
      ...draft,
      ...overrides,
      content: {
        ...draft.content,
        ...(overrides?.content ?? {}),
        stage: {
          widthFt: snapStageFt(
            overrides?.content?.stage?.widthFt ?? draft.content.stage.widthFt,
          ),
          depthFt: snapStageFt(
            overrides?.content?.stage?.depthFt ?? draft.content.stage.depthFt,
          ),
        },
      },
    };
    setSaveStatus("saving");
    setSaveError(null);
    try {
      await updateRider({
        riderId,
        name: next.name,
        status: next.status,
        content: next.content,
      });
      setDraft(next);
      setBaseline(draftKey(next));
      setSaveStatus("saved");
      if (savedFadeRef.current) clearTimeout(savedFadeRef.current);
      savedFadeRef.current = setTimeout(() => {
        setSaveStatus((status) => (status === "saved" ? "idle" : status));
      }, 3000);
    } catch (err) {
      setSaveStatus("error");
      setSaveError(getConvexErrorMessage(err));
    }
  }

  function discard() {
    if (!rider) return;
    const next: Draft = {
      name: rider.name,
      status: rider.status,
      content: contentFromRider(rider),
    };
    setDraft(next);
    setBaseline(draftKey(next));
    setSelectedId(null);
    setSaveStatus("idle");
    setSaveError(null);
  }

  if (rider === undefined || draft === null) {
    return (
      <Card>
        <CardContent className="py-8 text-sm text-muted-foreground">Loading rider…</CardContent>
      </Card>
    );
  }

  const selectedItem =
    draft.content.items.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" asChild>
          <Link href="/dashboard/bands-and-performers/riders">
            <ArrowLeftIcon className="size-4" />
            All riders
          </Link>
        </Button>
        {rider.isDefault ? (
          <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-800">
            Default for show files
          </span>
        ) : null}
        {readOnly ? (
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            View only
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 rounded-md border bg-card p-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="rider-editor-name">Rider name</Label>
          <Input
            id="rider-editor-name"
            value={draft.name}
            disabled={readOnly}
            maxLength={80}
            onChange={(event) =>
              setDraft((current) =>
                current ? { ...current, name: event.target.value } : current,
              )
            }
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RiderPdfDownloadButton riderId={riderId} />
          {!readOnly && !rider.isDefault ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                setActionError(null);
                void setDefault({ riderId }).catch((err) =>
                  setActionError(getConvexErrorMessage(err)),
                );
              }}
            >
              Set as default
            </Button>
          ) : null}
          {!readOnly ? (
            <Button
              type="button"
              size="sm"
              variant={draft.status === "published" ? "outline" : "default"}
              onClick={() => {
                const nextStatus =
                  draft.status === "published" ? "draft" : "published";
                void persist({ status: nextStatus });
              }}
            >
              {draft.status === "published" ? "Unpublish" : "Publish"}
            </Button>
          ) : null}
        </div>
      </div>

      {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}

      {warnings.length > 0 ? (
        <Alert>
          <AlertTitle>Before you publish</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_240px]">
        <Card className="xl:max-h-[720px] xl:overflow-y-auto">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Symbol palette</CardTitle>
            <p className="text-xs text-muted-foreground">
              Drag onto the stage, or tap to place in the center.
            </p>
          </CardHeader>
          <CardContent>
            <RiderSymbolPalette
              disabled={readOnly}
              onPlaceAtCenter={(symbolKey) =>
                placeAt(
                  symbolKey,
                  draft.content.stage.widthFt / 2,
                  draft.content.stage.depthFt / 2,
                )
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
            <CardTitle className="text-sm">Stage plot</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Label className="sr-only" htmlFor="stage-preset">
                Stage size
              </Label>
              <Select
                value={
                  STAGE_PRESETS.some(
                    (entry) =>
                      entry.stage.widthFt === draft.content.stage.widthFt &&
                      entry.stage.depthFt === draft.content.stage.depthFt,
                  )
                    ? `${draft.content.stage.widthFt}x${draft.content.stage.depthFt}`
                    : "custom"
                }
                disabled={readOnly}
                onValueChange={(value) => {
                  if (value === "custom") return;
                  const preset = STAGE_PRESETS.find(
                    (entry) =>
                      `${entry.stage.widthFt}x${entry.stage.depthFt}` === value,
                  );
                  if (!preset) return;
                  patchContent((content) => ({
                    ...content,
                    stage: { ...preset.stage },
                  }));
                }}
              >
                <SelectTrigger id="stage-preset" className="h-8 w-[200px]">
                  <SelectValue placeholder="Stage size" />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_PRESETS.map((preset) => (
                    <SelectItem
                      key={preset.label}
                      value={`${preset.stage.widthFt}x${preset.stage.depthFt}`}
                    >
                      {preset.label}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Custom (4 ft steps)</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1">
                <Select
                  value={String(snapStageFt(draft.content.stage.widthFt))}
                  disabled={readOnly}
                  onValueChange={(value) => {
                    const widthFt = snapStageFt(Number(value));
                    patchContent((content) => ({
                      ...content,
                      stage: { ...content.stage, widthFt },
                    }));
                  }}
                >
                  <SelectTrigger
                    aria-label="Stage width in feet"
                    className="h-8 w-[72px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stageSizeOptions().map((ft) => (
                      <SelectItem key={`w-${ft}`} value={String(ft)}>
                        {ft}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">×</span>
                <Select
                  value={String(snapStageFt(draft.content.stage.depthFt))}
                  disabled={readOnly}
                  onValueChange={(value) => {
                    const depthFt = snapStageFt(Number(value));
                    patchContent((content) => ({
                      ...content,
                      stage: { ...content.stage, depthFt },
                    }));
                  }}
                >
                  <SelectTrigger
                    aria-label="Stage depth in feet"
                    className="h-8 w-[72px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {stageSizeOptions().map((ft) => (
                      <SelectItem key={`d-${ft}`} value={String(ft)}>
                        {ft}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">ft</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto bg-slate-50 p-3 dark:bg-slate-950/40">
            <StagePlotCanvas
              content={draft.content}
              selectedId={selectedId}
              readOnly={readOnly}
              onSelect={setSelectedId}
              onMoveItem={(itemId, xFt, yFt) =>
                patchContent((content) => updateItem(content, itemId, { xFt, yFt }))
              }
              onRotateItem={(itemId, rotation) =>
                patchContent((content) =>
                  updateItem(content, itemId, { rotation }),
                )
              }
              onDeleteItem={(itemId) => {
                patchContent((content) => removeItem(content, itemId));
                setSelectedId((current) => (current === itemId ? null : current));
              }}
              onDropSymbol={placeAt}
            />
          </CardContent>
        </Card>

        <Card className="xl:max-h-[720px] xl:overflow-y-auto">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Selection</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedItem ? (
              <p className="text-sm text-muted-foreground">
                Select a symbol on the stage to rename it, add notes, or remove it.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="item-label">Label</Label>
                  <Input
                    id="item-label"
                    value={selectedItem.label}
                    disabled={readOnly}
                    onChange={(event) =>
                      patchContent((content) =>
                        updateItem(content, selectedItem.id, {
                          label: event.target.value,
                        }),
                      )
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="item-notes">Notes</Label>
                  <textarea
                    id="item-notes"
                    rows={3}
                    disabled={readOnly}
                    className={cn(fieldClass, "h-auto min-h-[72px] py-2")}
                    value={selectedItem.notes ?? ""}
                    onChange={(event) =>
                      patchContent((content) =>
                        updateItem(content, selectedItem.id, {
                          notes: event.target.value || undefined,
                        }),
                      )
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="item-rotation">Rotation</Label>
                    <Input
                      id="item-rotation"
                      type="number"
                      step={15}
                      disabled={readOnly}
                      value={selectedItem.rotation}
                      onChange={(event) => {
                        const rotation = Number(event.target.value);
                        if (!Number.isFinite(rotation)) return;
                        patchContent((content) =>
                          updateItem(content, selectedItem.id, {
                            rotation: ((rotation % 360) + 360) % 360,
                          }),
                        );
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="item-scale">Scale</Label>
                    <Input
                      id="item-scale"
                      type="number"
                      step={0.1}
                      min={0.5}
                      max={2}
                      disabled={readOnly}
                      value={selectedItem.scale}
                      onChange={(event) => {
                        const scale = Number(event.target.value);
                        if (!Number.isFinite(scale)) return;
                        patchContent((content) =>
                          updateItem(content, selectedItem.id, {
                            scale: Math.min(2, Math.max(0.5, scale)),
                          }),
                        );
                      }}
                    />
                  </div>
                </div>
                {!readOnly ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      patchContent((content) => removeItem(content, selectedItem.id));
                      setSelectedId(null);
                    }}
                  >
                    <TrashIcon className="size-3.5" />
                    Remove from plot
                  </Button>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <InputsSection
        inputs={draft.content.inputs}
        readOnly={readOnly}
        onChange={(inputs) => patchContent((content) => ({ ...content, inputs }))}
      />
      <MixesSection
        mixes={draft.content.monitorMixes}
        readOnly={readOnly}
        onChange={(monitorMixes) =>
          patchContent((content) => ({ ...content, monitorMixes }))
        }
      />
      <BacklineSection
        backline={draft.content.backline}
        readOnly={readOnly}
        onChange={(backline) => patchContent((content) => ({ ...content, backline }))}
      />
      <DetailsSection
        content={draft.content}
        readOnly={readOnly}
        onChange={(patch) => patchContent((content) => ({ ...content, ...patch }))}
      />

      {!readOnly ? (
        <FormSaveBar
          tier="C"
          saveStatus={saveStatus}
          saveError={saveError}
          isDirty={isDirty}
          saveLabel="Save rider"
          onSave={() => void persist()}
          onDiscard={discard}
          onRetry={() => void persist()}
          summary={
            <span className="text-xs text-muted-foreground">
              {draft.content.inputs.length} channels · {draft.content.monitorMixes.length}{" "}
              mixes · {draft.content.items.length} symbols
            </span>
          }
        />
      ) : null}
    </div>
  );
}

function InputsSection({
  inputs,
  readOnly,
  onChange,
}: {
  inputs: RiderInputChannel[];
  readOnly: boolean;
  onChange: (inputs: RiderInputChannel[]) => void;
}) {
  function patch(id: string, patch: Partial<RiderInputChannel>) {
    onChange(inputs.map((input) => (input.id === id ? { ...input, ...patch } : input)));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm">Input list</CardTitle>
        {!readOnly ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange([...inputs, blankInput(inputs)])}
          >
            <PlusIcon className="size-3.5" />
            Add channel
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {inputs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No channels yet. Place mics, DIs, or amps on the plot — or add a row.
          </p>
        ) : (
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-10 py-2 pr-2 font-medium">Ch</th>
                <th className="py-2 pr-2 font-medium">Source</th>
                <th className="w-28 py-2 pr-2 font-medium">Type</th>
                <th className="w-32 py-2 pr-2 font-medium">Mic / DI</th>
                <th className="w-32 py-2 pr-2 font-medium">Stand</th>
                <th className="w-14 py-2 pr-2 font-medium">48V</th>
                <th className="w-40 py-2 pr-2 font-medium">Provided by</th>
                <th className="py-2 pr-2 font-medium">Notes</th>
                {!readOnly ? <th className="w-20 py-2 font-medium" /> : null}
              </tr>
            </thead>
            <tbody>
              {inputs.map((input, index) => (
                <tr key={input.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-2 pt-3 text-muted-foreground">{input.channel}</td>
                  <td className="py-1.5 pr-2">
                    <input
                      className={fieldClass}
                      disabled={readOnly}
                      value={input.source}
                      onChange={(event) => patch(input.id, { source: event.target.value })}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      className={fieldClass}
                      disabled={readOnly}
                      value={input.inputType}
                      onChange={(event) =>
                        patch(input.id, {
                          inputType: event.target.value as RiderInputType,
                        })
                      }
                    >
                      {INPUT_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {INPUT_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      className={fieldClass}
                      disabled={readOnly}
                      value={input.micPreference ?? ""}
                      onChange={(event) =>
                        patch(input.id, {
                          micPreference: event.target.value || undefined,
                        })
                      }
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      className={fieldClass}
                      disabled={readOnly}
                      value={input.stand}
                      onChange={(event) =>
                        patch(input.id, {
                          stand: event.target.value as RiderStandType,
                        })
                      }
                    >
                      {STAND_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {STAND_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 pr-2">
                    <input
                      type="checkbox"
                      disabled={readOnly}
                      checked={input.phantom}
                      onChange={(event) =>
                        patch(input.id, { phantom: event.target.checked })
                      }
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      className={fieldClass}
                      disabled={readOnly}
                      value={input.providedBy}
                      onChange={(event) =>
                        patch(input.id, {
                          providedBy: event.target.value as RiderProvidedBy,
                        })
                      }
                    >
                      {PROVIDED_BY.map((value) => (
                        <option key={value} value={value}>
                          {PROVIDED_BY_EDITOR_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      className={fieldClass}
                      disabled={readOnly}
                      value={input.notes ?? ""}
                      onChange={(event) =>
                        patch(input.id, { notes: event.target.value || undefined })
                      }
                    />
                  </td>
                  {!readOnly ? (
                    <td className="py-1.5">
                      <div className="flex gap-0.5">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          disabled={index === 0}
                          aria-label="Move channel up"
                          onClick={() =>
                            onChange(renumberInputs(moveInArray(inputs, index, index - 1)))
                          }
                        >
                          <CaretUpIcon className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          disabled={index === inputs.length - 1}
                          aria-label="Move channel down"
                          onClick={() =>
                            onChange(renumberInputs(moveInArray(inputs, index, index + 1)))
                          }
                        >
                          <CaretDownIcon className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          className="text-destructive"
                          aria-label="Remove channel"
                          onClick={() =>
                            onChange(
                              renumberInputs(inputs.filter((row) => row.id !== input.id)),
                            )
                          }
                        >
                          <TrashIcon className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function MixesSection({
  mixes,
  readOnly,
  onChange,
}: {
  mixes: RiderMonitorMix[];
  readOnly: boolean;
  onChange: (mixes: RiderMonitorMix[]) => void;
}) {
  function patch(id: string, next: Partial<RiderMonitorMix>) {
    onChange(mixes.map((mix) => (mix.id === id ? { ...mix, ...next } : mix)));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm">Monitor mixes</CardTitle>
        {!readOnly ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange([...mixes, blankMix(mixes)])}
          >
            <PlusIcon className="size-3.5" />
            Add mix
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {mixes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Drop wedges or in-ears on the plot to create mixes automatically.
          </p>
        ) : (
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="w-12 py-2 pr-2 font-medium">Mix</th>
                <th className="py-2 pr-2 font-medium">For</th>
                <th className="w-32 py-2 pr-2 font-medium">Type</th>
                <th className="w-20 py-2 pr-2 font-medium">Sends</th>
                <th className="py-2 pr-2 font-medium">Notes</th>
                {!readOnly ? <th className="w-20 py-2 font-medium" /> : null}
              </tr>
            </thead>
            <tbody>
              {mixes.map((mix, index) => (
                <tr key={mix.id} className="border-b border-border/60 align-top">
                  <td className="py-2 pr-2 pt-3 text-muted-foreground">{mix.mixNumber}</td>
                  <td className="py-1.5 pr-2">
                    <input
                      className={fieldClass}
                      disabled={readOnly}
                      value={mix.label}
                      onChange={(event) => patch(mix.id, { label: event.target.value })}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      className={fieldClass}
                      disabled={readOnly}
                      value={mix.type}
                      onChange={(event) =>
                        patch(mix.id, {
                          type: event.target.value as RiderMonitorType,
                        })
                      }
                    >
                      {MONITOR_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {MONITOR_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="number"
                      min={0}
                      max={8}
                      className={fieldClass}
                      disabled={readOnly || mix.type === "iem"}
                      value={mix.sends}
                      onChange={(event) => {
                        const sends = Number(event.target.value);
                        if (!Number.isFinite(sends)) return;
                        patch(mix.id, { sends: Math.max(0, Math.min(8, sends)) });
                      }}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      className={fieldClass}
                      disabled={readOnly}
                      value={mix.notes ?? ""}
                      onChange={(event) =>
                        patch(mix.id, { notes: event.target.value || undefined })
                      }
                    />
                  </td>
                  {!readOnly ? (
                    <td className="py-1.5">
                      <div className="flex gap-0.5">
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          disabled={index === 0}
                          aria-label="Move mix up"
                          onClick={() =>
                            onChange(renumberMixes(moveInArray(mixes, index, index - 1)))
                          }
                        >
                          <CaretUpIcon className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          disabled={index === mixes.length - 1}
                          aria-label="Move mix down"
                          onClick={() =>
                            onChange(renumberMixes(moveInArray(mixes, index, index + 1)))
                          }
                        >
                          <CaretDownIcon className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-xs"
                          variant="ghost"
                          className="text-destructive"
                          aria-label="Remove mix"
                          onClick={() =>
                            onChange(
                              renumberMixes(mixes.filter((row) => row.id !== mix.id)),
                            )
                          }
                        >
                          <TrashIcon className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function BacklineSection({
  backline,
  readOnly,
  onChange,
}: {
  backline: RiderBacklineItem[];
  readOnly: boolean;
  onChange: (backline: RiderBacklineItem[]) => void;
}) {
  function patch(id: string, next: Partial<RiderBacklineItem>) {
    onChange(backline.map((item) => (item.id === id ? { ...item, ...next } : item)));
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-sm">Backline</CardTitle>
        {!readOnly ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onChange([...backline, blankBacklineItem()])}
          >
            <PlusIcon className="size-3.5" />
            Add item
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {backline.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            List amps, stands, and other gear you need on stage.
          </p>
        ) : (
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-2 pr-2 font-medium">Item</th>
                <th className="w-20 py-2 pr-2 font-medium">Qty</th>
                <th className="w-40 py-2 pr-2 font-medium">Provided by</th>
                <th className="py-2 pr-2 font-medium">Notes</th>
                {!readOnly ? <th className="w-12 py-2 font-medium" /> : null}
              </tr>
            </thead>
            <tbody>
              {backline.map((item) => (
                <tr key={item.id} className="border-b border-border/60 align-top">
                  <td className="py-1.5 pr-2">
                    <input
                      className={fieldClass}
                      disabled={readOnly}
                      value={item.label}
                      onChange={(event) => patch(item.id, { label: event.target.value })}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      className={fieldClass}
                      disabled={readOnly}
                      value={item.quantity}
                      onChange={(event) => {
                        const quantity = Number(event.target.value);
                        if (!Number.isFinite(quantity)) return;
                        patch(item.id, {
                          quantity: Math.max(1, Math.min(20, quantity)),
                        });
                      }}
                    />
                  </td>
                  <td className="py-1.5 pr-2">
                    <select
                      className={fieldClass}
                      disabled={readOnly}
                      value={item.providedBy}
                      onChange={(event) =>
                        patch(item.id, {
                          providedBy: event.target.value as RiderProvidedBy,
                        })
                      }
                    >
                      {PROVIDED_BY.map((value) => (
                        <option key={value} value={value}>
                          {PROVIDED_BY_EDITOR_LABELS[value]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-1.5 pr-2">
                    <input
                      className={fieldClass}
                      disabled={readOnly}
                      value={item.notes ?? ""}
                      onChange={(event) =>
                        patch(item.id, { notes: event.target.value || undefined })
                      }
                    />
                  </td>
                  {!readOnly ? (
                    <td className="py-1.5">
                      <Button
                        type="button"
                        size="icon-xs"
                        variant="ghost"
                        className="text-destructive"
                        aria-label="Remove backline item"
                        onClick={() =>
                          onChange(backline.filter((row) => row.id !== item.id))
                        }
                      >
                        <TrashIcon className="size-3.5" />
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function DetailsSection({
  content,
  readOnly,
  onChange,
}: {
  content: RiderContent;
  readOnly: boolean;
  onChange: (patch: Partial<RiderContent>) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Show details & notes</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="performer-count">Performers</Label>
          <Input
            id="performer-count"
            type="number"
            min={0}
            max={40}
            disabled={readOnly}
            value={content.performerCount ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                onChange({ performerCount: undefined });
                return;
              }
              const performerCount = Number(value);
              if (!Number.isFinite(performerCount)) return;
              onChange({
                performerCount: Math.max(0, Math.min(40, performerCount)),
              });
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="set-length">Set length (minutes)</Label>
          <Input
            id="set-length"
            type="number"
            min={0}
            max={240}
            disabled={readOnly}
            value={content.setLengthMinutes ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                onChange({ setLengthMinutes: undefined });
                return;
              }
              const setLengthMinutes = Number(value);
              if (!Number.isFinite(setLengthMinutes)) return;
              onChange({
                setLengthMinutes: Math.max(0, Math.min(240, setLengthMinutes)),
              });
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-name">Day-of contact</Label>
          <Input
            id="contact-name"
            disabled={readOnly}
            value={content.contactName ?? ""}
            onChange={(event) =>
              onChange({ contactName: event.target.value || undefined })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-email">Contact email</Label>
          <Input
            id="contact-email"
            type="email"
            disabled={readOnly}
            value={content.contactEmail ?? ""}
            onChange={(event) =>
              onChange({ contactEmail: event.target.value || undefined })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-phone">Contact phone</Label>
          <Input
            id="contact-phone"
            disabled={readOnly}
            value={content.contactPhone ?? ""}
            onChange={(event) =>
              onChange({ contactPhone: event.target.value || undefined })
            }
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="power-notes">Power</Label>
          <textarea
            id="power-notes"
            rows={2}
            disabled={readOnly}
            className={cn(fieldClass, "h-auto min-h-[64px] py-2")}
            value={content.powerNotes ?? ""}
            onChange={(event) =>
              onChange({ powerNotes: event.target.value || undefined })
            }
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="general-notes">Notes</Label>
          <textarea
            id="general-notes"
            rows={3}
            disabled={readOnly}
            className={cn(fieldClass, "h-auto min-h-[80px] py-2")}
            value={content.generalNotes ?? ""}
            onChange={(event) =>
              onChange({ generalNotes: event.target.value || undefined })
            }
          />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="hospitality-notes">Hospitality</Label>
          <textarea
            id="hospitality-notes"
            rows={2}
            disabled={readOnly}
            className={cn(fieldClass, "h-auto min-h-[64px] py-2")}
            value={content.hospitalityNotes ?? ""}
            onChange={(event) =>
              onChange({ hospitalityNotes: event.target.value || undefined })
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
