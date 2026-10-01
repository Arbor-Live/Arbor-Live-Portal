"use client";

import { useMemo, useState } from "react";
import {
  ArrowArcLeftIcon,
  ArrowArcRightIcon,
  ArrowClockwiseIcon,
  ArrowCounterClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  CopyIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  MinusIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  blankInput,
  INPUT_TYPE_LABELS,
  MAX_STAGE_FT,
  MIN_STAGE_FT,
  MONITOR_TYPE_LABELS,
  placeSymbol,
  removeItem,
  renumberInputs,
  RIDER_CATEGORY_ORDER,
  RIDER_CATEGORY_PALETTE,
  RIDER_TEMPLATES,
  riderSymbol,
  snapStageFt,
  STAGE_PRESETS,
  STAGE_SIZE_STEP,
  updateItem,
  type RiderContent,
  type RiderStage,
  type RiderStageItem,
  type RiderSymbolCategory,
} from "@arbor/rider-document";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/ui/number-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RiderGearStrip } from "@/components/riders/rider-gear-strip";
import { RiderSymbolGlyph } from "@/components/riders/rider-symbol-glyph";
import { channelBadge, RIDER_FAMILY } from "@/components/riders/rider-plot-theme";
import { StagePlotCanvas } from "@/components/riders/stage-plot-canvas";
import { Field, type RiderPanelProps } from "@/components/riders/rider-editor-parts";
import { cn } from "@/lib/utils";

const ROTATE_STEP = 15;
const ZOOM_STEPS = [1, 1.5, 2, 3] as const;
const RING_OFFSETS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
] as const;

function wrapDegrees(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

export type RiderHistoryControls = {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
};

/**
 * Where a tapped tile lands: the middle of the stage, or the nearest free
 * spot around it, so tapping five things in a row doesn't stack them.
 */
function freeSpot(content: RiderContent): { xFt: number; yFt: number } {
  const cx = content.stage.widthFt / 2;
  const cy = content.stage.depthFt / 2;
  const taken = (x: number, y: number) =>
    content.items.some((item) => Math.abs(item.xFt - x) < 1.5 && Math.abs(item.yFt - y) < 1.5);
  if (!taken(cx, cy)) return { xFt: cx, yFt: cy };
  for (let ring = 1; ring < 6; ring++) {
    for (const [dx, dy] of RING_OFFSETS) {
      const x = cx + dx * ring * 2;
      const y = cy + dy * ring * 2;
      if (x > 0 && x < content.stage.widthFt && y > 0 && y < content.stage.depthFt && !taken(x, y)) {
        return { xFt: x, yFt: y };
      }
    }
  }
  return { xFt: cx, yFt: cy };
}

/**
 * The stage plot tab: a stage you build by tapping or dragging gear from the
 * strip above it, each family in its own colour, with the channel and mix
 * every piece of gear produces printed beside it. The inspector shows and
 * edits everything attached to the selected item.
 */
export function RiderStagePanel({
  content,
  readOnly,
  onChange,
  history,
  onOpenChannel,
}: RiderPanelProps & {
  history: RiderHistoryControls;
  /** Jumps to a channel in the Inputs tab. */
  onOpenChannel: (inputId: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoomIndex, setZoomIndex] = useState(0);
  const [showPatch, setShowPatch] = useState(true);
  const zoom = ZOOM_STEPS[zoomIndex];

  const selectedItem = content.items.find((item) => item.id === selectedId) ?? null;

  const counts = useMemo(() => {
    const result = Object.fromEntries(RIDER_CATEGORY_ORDER.map((category) => [category, 0])) as Record<
      RiderSymbolCategory,
      number
    >;
    for (const item of content.items) result[riderSymbol(item.symbol).category] += 1;
    return result;
  }, [content.items]);

  function placeAt(symbolKey: string, xFt: number, yFt: number) {
    const result = placeSymbol(content, { symbolKey, xFt, yFt });
    onChange(() => result.content);
    setSelectedId(result.itemId);
  }

  function patchItem(itemId: string, patch: Partial<RiderStageItem>) {
    onChange(
      (current) => updateItem(current, itemId, patch),
      `item:${itemId}:${Object.keys(patch).join()}`,
    );
  }

  /** A copy 1 ft down and right, so it's visibly separate; mics bring their channels too. */
  function duplicateItem(itemId: string) {
    const item = content.items.find((candidate) => candidate.id === itemId);
    if (!item) return;
    const result = placeSymbol(content, {
      symbolKey: item.symbol,
      xFt: item.xFt + 1,
      yFt: item.yFt + 1,
      label: item.label,
      rotation: item.rotation,
      scale: item.scale,
    });
    onChange(() => result.content);
    setSelectedId(result.itemId);
  }

  function deleteItem(itemId: string) {
    onChange((current) => removeItem(current, itemId));
    setSelectedId((current) => (current === itemId ? null : current));
  }

  /** A new channel produced by this item, opened straight away in the Inputs tab. */
  function addChannelFor(item: RiderStageItem) {
    const input = { ...blankInput(content.inputs), source: item.label, stageItemId: item.id };
    onChange((current) => ({ ...current, inputs: renumberInputs([...current.inputs, input]) }));
    onOpenChannel(input.id);
  }

  function startFrom(templateKey: string) {
    const template = RIDER_TEMPLATES.find((entry) => entry.key === templateKey);
    if (!template) return;
    const built = template.build();
    onChange((current) => ({
      ...current,
      stage: built.stage,
      items: built.items,
      inputs: built.inputs,
      monitorMixes: built.monitorMixes,
      backline: current.backline.length > 0 ? current.backline : built.backline,
    }));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start" data-testid="rider-stage-panel">
      <Card className="min-w-0 gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold">Stage</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {content.items.length === 0
                ? "Nothing on stage yet."
                : `${content.items.length} thing${content.items.length === 1 ? "" : "s"} on stage, drawn from the audience's view.`}
            </p>
          </div>
          <StageSizeControl
            stage={content.stage}
            readOnly={readOnly}
            onChange={(stage) => onChange((current) => ({ ...current, stage }), "stage-size")}
          />
        </div>

        {!readOnly ? (
          <RiderGearStrip
            counts={counts}
            onAdd={(symbolKey) => {
              const spot = freeSpot(content);
              placeAt(symbolKey, spot.xFt, spot.yFt);
            }}
          />
        ) : null}

        <div className="bg-muted/25 p-2 sm:p-4">
          <StagePlotCanvas
            content={content}
            selectedId={selectedId}
            readOnly={readOnly}
            zoom={zoom}
            showPatch={showPatch}
            onSelect={setSelectedId}
            onMoveItem={(itemId, xFt, yFt) => patchItem(itemId, { xFt, yFt })}
            onRotateItem={(itemId, rotation) => patchItem(itemId, { rotation })}
            onDeleteItem={deleteItem}
            onDuplicateItem={duplicateItem}
            onDropSymbol={placeAt}
            emptyState={
              readOnly ? null : <StarterLayouts hasChannels={content.inputs.length > 0} onPick={startFrom} />
            }
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2">
          <div className="flex items-center">
            {!readOnly ? (
              <>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={!history.canUndo}
                  aria-label="Undo"
                  title="Undo (⌘Z)"
                  onClick={history.undo}
                >
                  <ArrowCounterClockwiseIcon />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  disabled={!history.canRedo}
                  aria-label="Redo"
                  title="Redo (⇧⌘Z)"
                  onClick={history.redo}
                >
                  <ArrowClockwiseIcon />
                </Button>
                <span className="mx-2 h-4 w-px bg-border" aria-hidden />
              </>
            ) : null}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={zoomIndex === 0}
              aria-label="Zoom out"
              onClick={() => setZoomIndex((index) => Math.max(index - 1, 0))}
            >
              <MagnifyingGlassMinusIcon />
            </Button>
            <span className="w-10 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              disabled={zoomIndex === ZOOM_STEPS.length - 1}
              aria-label="Zoom in"
              onClick={() => setZoomIndex((index) => Math.min(index + 1, ZOOM_STEPS.length - 1))}
            >
              <MagnifyingGlassPlusIcon />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="rider-show-patch" size="sm" checked={showPatch} onCheckedChange={setShowPatch} />
            <Label htmlFor="rider-show-patch" className="text-xs font-normal text-muted-foreground">
              Channel numbers
            </Label>
          </div>
        </div>
      </Card>

      <StageInspector
        content={content}
        selected={selectedItem}
        readOnly={readOnly}
        onSelect={setSelectedId}
        onPatch={patchItem}
        onChange={onChange}
        onDuplicate={duplicateItem}
        onDelete={deleteItem}
        onOpenChannel={onOpenChannel}
        onAddChannel={addChannelFor}
      />
    </div>
  );
}

/** One tap from an empty stage to a full plot, input list and monitor mixes. */
function StarterLayouts({ hasChannels, onPick }: { hasChannels: boolean; onPick: (key: string) => void }) {
  return (
    <div className="max-w-md space-y-3 text-center" data-testid="rider-starter-layouts">
      <div>
        <p className="text-sm font-medium">Start with a layout</p>
        <p className="text-xs text-muted-foreground">
          {hasChannels
            ? "Replaces the current channels and mixes with the layout's."
            : "You get the plot, the channels and the monitor mixes. Rearrange from there."}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {RIDER_TEMPLATES.map((template) => (
          <Button
            key={template.key}
            type="button"
            size="sm"
            variant="outline"
            className="bg-card"
            title={template.description}
            onClick={() => onPick(template.key)}
          >
            {template.name}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">Or tap gear above to place it piece by piece.</p>
    </div>
  );
}

/** "24 × 12 ft" button opening presets and 4 ft steppers for each side. */
function StageSizeControl({
  stage,
  readOnly,
  onChange,
}: {
  stage: RiderStage;
  readOnly: boolean;
  onChange: (stage: RiderStage) => void;
}) {
  const label = `${stage.widthFt} × ${stage.depthFt} ft`;
  if (readOnly) {
    return <span className="text-sm tabular-nums text-muted-foreground">{label}</span>;
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="sm" variant="outline" aria-label={`Stage size: ${label}`}>
          <span className="tabular-nums">{label}</span>
          <CaretDownIcon className="size-3" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-3 p-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Stage size</p>
        <div className="grid gap-1.5">
          {STAGE_PRESETS.map((preset) => {
            const active = preset.stage.widthFt === stage.widthFt && preset.stage.depthFt === stage.depthFt;
            return (
              <Button
                key={preset.label}
                type="button"
                size="sm"
                variant={active ? "secondary" : "ghost"}
                className="justify-start"
                aria-pressed={active}
                onClick={() => onChange({ ...preset.stage })}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>
        <FeetStepper label="Width" value={stage.widthFt} onChange={(widthFt) => onChange({ ...stage, widthFt })} />
        <FeetStepper label="Depth" value={stage.depthFt} onChange={(depthFt) => onChange({ ...stage, depthFt })} />
      </PopoverContent>
    </Popover>
  );
}

function FeetStepper({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const snapped = snapStageFt(value);
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={snapped <= MIN_STAGE_FT}
          aria-label={`Shrink the stage ${label.toLowerCase()}`}
          onClick={() => onChange(snapStageFt(snapped - STAGE_SIZE_STEP))}
        >
          <MinusIcon />
        </Button>
        <span className="w-12 text-center tabular-nums">{snapped} ft</span>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          disabled={snapped >= MAX_STAGE_FT}
          aria-label={`Grow the stage ${label.toLowerCase()}`}
          onClick={() => onChange(snapStageFt(snapped + STAGE_SIZE_STEP))}
        >
          <PlusIcon />
        </Button>
      </div>
    </div>
  );
}

/** A small uppercase section heading, as in the dashboard's side panels. */
function InspectorSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5 border-t px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * With nothing selected: everything on stage, grouped by family with its
 * channels, so small symbols are easy to pick on a phone. With a selection:
 * the item and everything attached to it (channels, monitor mix) in one place.
 */
function StageInspector({
  content,
  selected,
  readOnly,
  onSelect,
  onPatch,
  onChange,
  onDuplicate,
  onDelete,
  onOpenChannel,
  onAddChannel,
}: {
  content: RiderContent;
  selected: RiderStageItem | null;
  readOnly: boolean;
  onSelect: (itemId: string | null) => void;
  onPatch: (itemId: string, patch: Partial<RiderStageItem>) => void;
  onChange: RiderPanelProps["onChange"];
  onDuplicate: (itemId: string) => void;
  onDelete: (itemId: string) => void;
  onOpenChannel: (inputId: string) => void;
  onAddChannel: (item: RiderStageItem) => void;
}) {
  const channelsByItem = useMemo(() => {
    const map = new Map<string, RiderContent["inputs"]>();
    for (const input of content.inputs) {
      if (!input.stageItemId) continue;
      map.set(input.stageItemId, [...(map.get(input.stageItemId) ?? []), input]);
    }
    return map;
  }, [content.inputs]);

  if (!selected) {
    const groups = RIDER_CATEGORY_ORDER.map((category) => ({
      category,
      items: content.items.filter((item) => riderSymbol(item.symbol).category === category),
    })).filter((group) => group.items.length > 0);

    return (
      <Card className="gap-0 py-0 lg:sticky lg:top-14" data-testid="rider-stage-inspector">
        <div className="px-4 py-3">
          <h2 className="text-sm font-semibold">On stage</h2>
          <p className="text-xs text-muted-foreground">
            {content.items.length === 0
              ? "Gear you place shows up here, with its channels."
              : readOnly
                ? "Select something to see its details."
                : "Select something to edit it and its channels."}
          </p>
        </div>
        <div className="lg:max-h-[65vh] lg:overflow-y-auto">
          {groups.map((group) => (
            <section key={group.category} className="border-t">
              <p className="flex items-center gap-1.5 px-4 pt-2.5 pb-1 text-2xs font-semibold tracking-wide text-muted-foreground uppercase">
                <span className={cn("size-2 rounded-full", RIDER_FAMILY[group.category].dot)} aria-hidden />
                {RIDER_CATEGORY_PALETTE[group.category].label}
              </p>
              <ul className="pb-1.5">
                {group.items.map((item) => {
                  const channels = channelBadge(channelsByItem.get(item.id) ?? []);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(item.id)}
                        className="flex w-full items-center gap-2.5 px-4 py-1.5 text-left text-sm transition-colors hover:bg-muted/40"
                      >
                        <RiderSymbolGlyph symbolKey={item.symbol} size={22} />
                        <span className="min-w-0 flex-1 truncate">{item.label || riderSymbol(item.symbol).label}</span>
                        {channels ? (
                          <span className="shrink-0 text-xs tabular-nums text-rider-input">Ch {channels}</span>
                        ) : null}
                        <CaretRightIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      </Card>
    );
  }

  const symbol = riderSymbol(selected.symbol);
  const family = RIDER_FAMILY[symbol.category];
  const rotation = wrapDegrees(selected.rotation);
  const channels = channelsByItem.get(selected.id) ?? [];
  const mix = selected.monitorMixId
    ? content.monitorMixes.find((candidate) => candidate.id === selected.monitorMixId)
    : undefined;
  const takesChannels = symbol.category !== "monitor" && symbol.category !== "stage";

  return (
    <Card key={selected.id} className="gap-0 py-0 lg:sticky lg:top-14" data-testid="rider-stage-inspector">
      <div className="flex items-start gap-3 px-4 py-3">
        <RiderSymbolGlyph symbolKey={selected.symbol} size={36} />
        <div className="min-w-0 flex-1 space-y-1">
          <Label htmlFor="rider-item-label" className="sr-only">
            Label
          </Label>
          <Input
            id="rider-item-label"
            disabled={readOnly}
            value={selected.label}
            placeholder={symbol.label}
            className="h-8 border-transparent px-1.5 text-base font-semibold hover:border-border"
            onChange={(event) => onPatch(selected.id, { label: event.target.value })}
          />
          <span className={cn("ml-1.5 inline-flex items-center border px-1.5 text-2xs font-medium", family.chip)}>
            {symbol.label}
          </span>
        </div>
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Done editing" onClick={() => onSelect(null)}>
          <XIcon />
        </Button>
      </div>

      {takesChannels ? (
        <InspectorSection
          title="Channels"
          action={
            !readOnly ? (
              <Button type="button" size="xs" variant="ghost" onClick={() => onAddChannel(selected)}>
                <PlusIcon />
                Add
              </Button>
            ) : null
          }
        >
          {channels.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nothing patched from this yet. Add a channel if it needs a mic or a DI.
            </p>
          ) : (
            <ul className="-mx-2">
              {channels.map((input) => (
                <li key={input.id}>
                  <button
                    type="button"
                    onClick={() => onOpenChannel(input.id)}
                    className="flex w-full items-center gap-2.5 px-2 py-1.5 text-left transition-colors hover:bg-muted/40"
                  >
                    <span className="w-10 shrink-0 bg-rider-input/15 py-0.5 text-center text-xs font-semibold tabular-nums text-rider-input">
                      {input.stereo ? `${input.channel}–${input.channel + 1}` : input.channel}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{input.source || "Unnamed channel"}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[INPUT_TYPE_LABELS[input.inputType], input.micPreference, input.phantom ? "48V" : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <CaretRightIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </InspectorSection>
      ) : null}

      {mix ? (
        <InspectorSection title={`Monitor mix ${mix.mixNumber} · ${MONITOR_TYPE_LABELS[mix.type]}`}>
          <Field id="rider-item-mix" label="Who hears it" hint="Sends and notes live in the Monitors tab.">
            <Input
              id="rider-item-mix"
              disabled={readOnly}
              value={mix.label}
              placeholder="e.g. Lead vocal"
              onChange={(event) => {
                const label = event.target.value;
                onChange(
                  (current) => ({
                    ...current,
                    monitorMixes: current.monitorMixes.map((candidate) =>
                      candidate.id === mix.id ? { ...candidate, label } : candidate,
                    ),
                  }),
                  `mix:${mix.id}:label`,
                );
              }}
            />
          </Field>
        </InspectorSection>
      ) : null}

      <InspectorSection title="Placement">
        {symbol.resizable ? (
          <div className="grid grid-cols-2 gap-3">
            <Field id="rider-item-width" label="Width (ft)">
              <NumberInput
                id="rider-item-width"
                step={symbol.resizable.stepFt}
                min={symbol.resizable.minFt}
                max={symbol.resizable.maxFt}
                fallback={symbol.widthFt}
                disabled={readOnly}
                value={selected.widthFt ?? symbol.widthFt}
                onValueChange={(widthFt) => onPatch(selected.id, { widthFt })}
              />
            </Field>
            <Field id="rider-item-depth" label="Depth (ft)">
              <NumberInput
                id="rider-item-depth"
                step={symbol.resizable.stepFt}
                min={symbol.resizable.minFt}
                max={symbol.resizable.maxFt}
                fallback={symbol.depthFt}
                disabled={readOnly}
                value={selected.depthFt ?? symbol.depthFt}
                onValueChange={(depthFt) => onPatch(selected.id, { depthFt })}
              />
            </Field>
          </div>
        ) : null}
        <div className={cn("grid gap-3", symbol.resizable ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_5.5rem]")}>
          <Field id="rider-item-rotation" label="Rotation">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                disabled={readOnly}
                aria-label={`Rotate ${selected.label} left`}
                onClick={() => onPatch(selected.id, { rotation: wrapDegrees(rotation - ROTATE_STEP) })}
              >
                <ArrowArcLeftIcon />
              </Button>
              <NumberInput
                id="rider-item-rotation"
                step={ROTATE_STEP}
                disabled={readOnly}
                className="min-w-0 text-center"
                value={rotation}
                normalize={wrapDegrees}
                onValueChange={(next) => onPatch(selected.id, { rotation: next })}
              />
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                disabled={readOnly}
                aria-label={`Rotate ${selected.label} right`}
                onClick={() => onPatch(selected.id, { rotation: wrapDegrees(rotation + ROTATE_STEP) })}
              >
                <ArrowArcRightIcon />
              </Button>
            </div>
          </Field>
          {!symbol.resizable ? (
            <Field id="rider-item-scale" label="Size">
              <NumberInput
                id="rider-item-scale"
                step={0.1}
                min={0.5}
                max={2}
                fallback={1}
                disabled={readOnly}
                value={selected.scale}
                onValueChange={(scale) => onPatch(selected.id, { scale })}
              />
            </Field>
          ) : null}
        </div>
      </InspectorSection>

      <InspectorSection title="Notes">
        <Label htmlFor="rider-item-notes" className="sr-only">
          Notes
        </Label>
        <Textarea
          id="rider-item-notes"
          rows={2}
          disabled={readOnly}
          placeholder="Anything crew should know about it"
          value={selected.notes ?? ""}
          onChange={(event) => onPatch(selected.id, { notes: event.target.value || undefined })}
        />
      </InspectorSection>

      {!readOnly ? (
        <div className="space-y-2 border-t px-4 py-3">
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => onDuplicate(selected.id)}>
              <CopyIcon />
              Duplicate
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive"
              onClick={() => onDelete(selected.id)}
            >
              <TrashIcon />
              Remove
            </Button>
          </div>
          {channels.length > 0 || mix ? (
            <p className="text-xs text-muted-foreground">
              Removing it also removes{" "}
              {[
                channels.length > 0 ? `${channels.length} channel${channels.length === 1 ? "" : "s"}` : null,
                mix ? `mix ${mix.mixNumber}` : null,
              ]
                .filter(Boolean)
                .join(" and ")}
              . Undo brings them back.
            </p>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
